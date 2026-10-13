# syntax=docker/dockerfile:1
#
# One image for running Igor, developing it and testing it in CI. Igor runs on node and shells
# out to git, gh and the claude CLI. Each of the four versions is pinned here and nowhere else.
#
#   docker build --target runtime     .   # the igor CLI on PATH; deploy/docker-compose.yml
#   docker build --target development .   # the tools without Igor; .devcontainer and CI
#
# Upgrading a pin is a one-line change to an ARG below, and docs/deployment.md says what to
# check first. The claude pin matters most: Igor parses that CLI's stream output for results,
# cost and usage, so a new release can change what Igor reads without anything failing loudly.
#
# Nothing secret is baked in. The claude subscription tokens and the GitHub App key arrive at
# run time, through the env_file and secrets in deploy/docker-compose.yml.

ARG NODE_VERSION=26.3.0
ARG GIT_VERSION=2.54.0
ARG GIT_SHA256=f689162364c10de79ef89aa8dbf48731eb057e34edbbd20aca510ce0154681a3
ARG GH_VERSION=2.94.0
ARG GH_SHA256_AMD64=a757f1ba6db18f4de8cbadb244843a5f89bc75b5e7c6fc127d2bd77fbd12ed62
ARG GH_SHA256_ARM64=705a23b70b0f1b7ba4c302fdcef392ce3edaacfa7ce8e85e4d93d72ea800a538
ARG CLAUDE_CODE_VERSION=2.1.296

# --- git, built from source: no Debian release ships the pinned version -----------------------
FROM node:${NODE_VERSION}-trixie-slim AS git
ARG GIT_VERSION
ARG GIT_SHA256
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils make gcc libc6-dev libcurl4-gnutls-dev zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSLo git.tar.xz "https://www.kernel.org/pub/software/scm/git/git-${GIT_VERSION}.tar.xz" \
 && echo "${GIT_SHA256}  git.tar.xz" | sha256sum -c - \
 && tar -xJf git.tar.xz --strip-components=1 \
 && make -j"$(nproc)" prefix=/usr/local NO_TCLTK=1 NO_GETTEXT=1 NO_PERL=1 NO_PYTHON=1 NO_EXPAT=1 \
      DESTDIR=/out install

# --- gh, the release binary checked against its published checksum ---------------------------
FROM node:${NODE_VERSION}-trixie-slim AS gh
ARG GH_VERSION
ARG GH_SHA256_AMD64
ARG GH_SHA256_ARM64
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN case "${TARGETARCH}" in \
      amd64) sum="${GH_SHA256_AMD64}" ;; \
      arm64) sum="${GH_SHA256_ARM64}" ;; \
      *) echo "no gh checksum for ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSLo gh.tar.gz \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.tar.gz" \
 && echo "${sum}  gh.tar.gz" | sha256sum -c - \
 && tar -xzf gh.tar.gz --strip-components=1 \
 && install -m 755 bin/gh /usr/local/bin/gh

# --- base: node, git, gh and claude, shared by every target below ----------------------------
FROM node:${NODE_VERSION}-trixie-slim AS base
ARG GIT_VERSION
ARG GH_VERSION
ARG CLAUDE_CODE_VERSION
# Runtime libraries for the git built above: libcurl for HTTPS remotes, zlib for objects.
# ca-certificates lets git, gh and claude verify TLS. less is the pager git and gh use.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libcurl3t64-gnutls zlib1g less \
 && rm -rf /var/lib/apt/lists/*
COPY --from=git /out/usr/local/ /usr/local/
COPY --from=gh /usr/local/bin/gh /usr/local/bin/gh
# The npm package installs the native binary for this platform from a version-locked
# optional dependency, so the version here is the version that runs.
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force
# Without this, claude's background updater replaces the pinned binary in a running container.
# With it, claude changes version only when the image is rebuilt with a new pin.
ENV DISABLE_AUTOUPDATER=1
# A build that installed some other version of git, gh or claude fails here. The base image
# tag already fixes node's version.
RUN git --version | grep -qx "git version ${GIT_VERSION}" \
 && gh --version | grep -q "^gh version ${GH_VERSION} " \
 && claude --version | grep -q "^${CLAUDE_CODE_VERSION} "

# --- development: the tools and no Igor, for the devcontainer and CI ------------------------
FROM base AS development
# The devcontainer and CI both mount the checkout at /workspace. Under a different owner git
# refuses to read it. Some tests need git to read it: they run igor init on the checkout, and
# init asks git which repository a directory is in before it refuses igor's own installation.
# Only /workspace is trusted, because
# tests that simulate a foreign owner need git to keep refusing everywhere else.
RUN git config --system --add safe.directory /workspace \
 # Tests create repositories and check out main by name, so git's default branch must be main.
 && git config --system init.defaultBranch main
WORKDIR /workspace
USER node

# --- build: compile the CLI from source ------------------------------------------------------
FROM base AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime: the built igor CLI on PATH -----------------------------------------------------
# Laid out the way the published package is: dist, templates and the example config beside
# package.json. igor reads templates and the example config from the directory above dist.
# There is no src, so igor's check that dist is older than src finds nothing to warn about.
FROM base AS runtime
# igor serve stops a worker by killing its whole process group at once. The worker dies in the
# same instant as its children, so it never reaps them, and they pass to PID 1 as zombies.
# node as PID 1 reaps only children it spawned itself, so the zombies would accumulate. tini
# as PID 1 reaps them and passes SIGTERM on to igor.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]
WORKDIR /opt/igor
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /build/dist ./dist
COPY templates ./templates
COPY igor.config.example.yaml ./
RUN ln -s /opt/igor/dist/cli.js /usr/local/bin/igor
# deploy/docker-compose.yml mounts the lore repository here. A host directory keeps its host
# owner, and git refuses a repository it does not own without this.
RUN git config --system --add safe.directory /srv/lore \
 # Igor merges a base branch into a task's tree with merge --no-commit, which git refuses
 # without a committer identity. Igor publishes through the GitHub API, so this identity is
 # in no commit anyone sees. A user or repository identity overrides it.
 && git config --system user.name igor \
 && git config --system user.email igor@localhost.invalid
WORKDIR /srv/lore
USER node
