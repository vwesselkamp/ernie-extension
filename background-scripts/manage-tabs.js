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
    console.log('oncomplete')
    browserTabs.evaluateTab(details.tabId)
}

browser.webNavigation.onCompleted.addListener(onCompleted);

browserTabs.setCurrentTab()
    .then(() => browser.tabs.query({}))
    .then(tabs =>{
        for (let tab of tabs) {
            if(tab.url.startsWith("about:")) continue;
            browserTabs.initializeCleanTab(tab.id);
        }
    })
    .catch(error => console.error(error))
