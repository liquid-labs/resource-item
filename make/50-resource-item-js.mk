# This file was generated by @liquid-labs/catalyst-builder-workflow-local-make-
# node. Refer to https://npmjs.com/package/@liquid-labs/catalyst-builder-workflow-
# local-make-node for further details

#####
# build dist/@liquid-labs/resource-item.js
#####

CATALYST_RESOURCE_ITEM_JS:=$(DIST)/resource-item.js
CATALYST_RESOURCE_ITEM_JS_ENTRY=$(SRC)/index.mjs
BUILD_TARGETS+=$(CATALYST_RESOURCE_ITEM_JS)

$(CATALYST_RESOURCE_ITEM_JS): package.json $(CATALYST_ALL_NON_TEST_JS_FILES_SRC)
	JS_BUILD_TARGET=$(CATALYST_RESOURCE_ITEM_JS_ENTRY) \
	  JS_OUT=$@ \
	  $(CATALYST_ROLLUP) --config $(CATALYST_ROLLUP_CONFIG)

#####
# end dist/@liquid-labs/resource-item.js
#####
