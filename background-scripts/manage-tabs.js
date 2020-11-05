// triggered when a new tab is opened
browser.tabs.onCreated.addListener((tab) => {
    if(tab.url.startsWith("about:")) return;
  browserTabs.initializeCleanTab(tab.id);
});


// Triggered on a Navigational event, which could be reloading, forwards/backwards button, entering a new URL,
// clicking a link or a redirect.
browser.webNavigation.onBeforeNavigate.addListener(browserTabs.clearTabsData.bind(browserTabs));

// Update current tab when another tab is activated
// This event doesn't react if window is changed, which is why we need the onFocusedChanged event as well
browser.tabs.onActivated.addListener(browserTabs.setCurrentTab.bind(browserTabs));

browser.windows.onFocusChanged.addListener(browserTabs.setCurrentTab.bind(browserTabs));

browser.tabs.onRemoved.addListener(browserTabs.removeContainer.bind(browserTabs));

//wrap such that we can call evaluateTab with the ID only
function onCompleted(details){
    browserTabs.evaluateTab(details.tabId)
}

browser.webNavigation.onCompleted.addListener(onCompleted);

/*
 remove all identities that are leftover from a shutdown of the extension
 this is needed during development, all cases of a running browser should be covered elsewhere
 */

function removeOldIdentities(identities) {
    for (let identity of identities) {
        if (identity.name.startsWith("shadow")) {
            browser.contextualIdentities.remove(identity.cookieStoreId)
                .catch((e) => console.log(e));
        }
    }
    console.info("Removed old identities");
}
/*
browser.contextualIdentities.query({})
    .then(removeOldIdentities)
*/
browserTabs.setCurrentTab()
    .then(() => browser.tabs.query({}))
    .then(tabs =>{
        for (let tab of tabs) {
            if(tab.url.startsWith("about:")) continue;
            browserTabs.initializeCleanTab(tab.id);
        }
    })
    .catch(error => console.error(error))
