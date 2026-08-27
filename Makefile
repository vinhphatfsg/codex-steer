PREFIX ?= $(HOME)/.local

.PHONY: check test install-local uninstall-local

check:
	npm run check

test:
	npm test

install-local: check test
	mkdir -p "$(PREFIX)/bin"
	ln -sfn "$(CURDIR)/bin/codex-steer.mjs" "$(PREFIX)/bin/codex-steer"

uninstall-local:
	rm "$(PREFIX)/bin/codex-steer"
