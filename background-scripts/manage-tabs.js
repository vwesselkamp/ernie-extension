function initializeTabManagement() {
    browserTabs = new Tabs();
    browserTabs.initializeShadowWindow()

    // triggered when a new tab is opened
    browser.tabs.onCreated.addListener((tab) => {
        if (tab.url.startsWith("chrome:")) return;
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

    browser.webNavigation.onCompleted.addListener(onCompleted);

    browserTabs.setCurrentTab()
        .then(() => browser.tabs.query({}))
        .then(tabs => {
            for (let tab of tabs) {
                if (tab.url.startsWith("chrome:")) continue;
                browserTabs.initializeCleanTab(tab.id);
            }
        })
        .catch(error => console.error(error))
}

function startShadowWindow() {
    browser.extension.isAllowedIncognitoAccess().then((isAllowedAccess) => {
        if (isAllowedAccess){
            initializeTabManagement();
            initializeRequestManagement()
        } else {
            setTimeout(startShadowWindow, 5000);
        }
    });
}

startShadowWindow();


//wrap such that we can call evaluateTab with the ID only
function onCompleted(details){
    browserTabs.evaluateTab(details.tabId)
}
