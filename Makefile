# Kyber Fox build entry points. Python tools live in tools/.
PYTHON ?= python3
TREE := work/tree
# test-tools uses the project virtualenv when present; pytest is not a tool dependency.
PYTEST := $(if $(wildcard .venv/bin/pytest),.venv/bin/pytest,pytest)

# The build reads this mozconfig through MOZCONFIG; Firefox itself is not patched for it.
export MOZCONFIG ?= $(abspath mozconfigs/linux)

.PHONY: assemble configure build package test-tools

assemble:
	$(PYTHON) -m tools.assemble

configure:
	cd $(TREE) && ./mach configure

build:
	cd $(TREE) && ./mach build

package:
	cd $(TREE) && ./mach package

test-tools:
	$(PYTEST) tests -v
