.PHONY: build package install clean bump bump-patch bump-minor bump-major

EXT_NAME := thrift-support
VERSION  ?= patch

build:
	pnpm run build

package: build
	pnpm run package

bump:
	pnpm version $(VERSION) --no-git-tag-version && pnpm run package

bump-patch:
	$(MAKE) bump VERSION=patch

bump-minor:
	$(MAKE) bump VERSION=minor

bump-major:
	$(MAKE) bump VERSION=major

clean:
	rm -f $(EXT_NAME)-*.vsix

install: bump
	@VSIX=$$(ls -t $(EXT_NAME)-*.vsix 2>/dev/null | head -1); \
	if [ -z "$$VSIX" ]; then \
		echo "Error: no .vsix file found. Run 'make package' first."; \
		exit 1; \
	fi; \
	echo "Installing $$VSIX ..."; \
	code --install-extension "$$VSIX"
