// shares the id of the tab that is currently open to the other background scripts
var currentTab;
// stores all tabs by their tabId as index as TabInfo objects
var tabs = [];


/**
 * init new Tab after clicking link, reloading or after startup
 * There is the tabId -1, which isn't associated with any tab
 */
function initializeCleanTab(browserTabId) {
    if( browserTabId === -1 ) {
        return;
    }
    // gets the information about our tab and initializes our own TabInfo object with it
    browser.tabs.get(browserTabId)
        .then((tab) => {
            if(tab.cookieStoreId !== "firefox-default") {
                return;
            }
            if(tab.url == null) return

            if(tabs[browserTabId]){
              tabs[browserTabId].removeContainerIfExists();
            }
            tabs[browserTabId] = new TabInfo(tab.url, browserTabId);
        }).catch(error => console.error(error))
}

// triggered when a new tab is opened
browser.tabs.onCreated.addListener((tab) => {
  initializeCleanTab(tab.id);
});

/**
 * Whenever we leave the current page, we throw out all old data and start with a new TabInfo object
 * @param details
 */
function clearTabsData(details){
    /**
     * Notifies Popup so that it can throw out all old requests as well, and start displaying the new ones
     */
    function notifyPopupOfReload() {
        browser.runtime.sendMessage({
            reload: true
        })
            // TODO: code duplication with webrequest class here
            .then()
            .catch(function (error) {
                // All requests are send, but can only be received if popup is open. This error is a result of this.
                // We can just drop it
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                // Any error printed from here is likely because the popup expected another format from the message
                console.error(error);
            });
    }

    const getting = browser.tabs.get(details.tabId);

    getting.then((tab) =>{
        if(tab.cookieStoreId !== "firefox-default") return;

        // if the Navigation happens in an iFrame on the page we don't care
        if(details.frameId !== 0) {
            console.info("Navigational event on " + details.url + " with frame id " + details.frameId)
            return;
        }

        setCurrentTab(); // probably unnecessary?

        if(tabs[details.tabId]){
            tabs[details.tabId].removeContainerIfExists();
        }
        tabs[details.tabId] = new TabInfo(details.url, details.tabId);
        console.info("Cleared tab for " + details.url);


        notifyPopupOfReload();
    })
}

// Triggered on a Navigational event, which could be reloading, forwards/backwards button, entering a new URL,
// clicking a link or a redirect.
browser.webNavigation.onBeforeNavigate.addListener(clearTabsData);



function getActiveTab() {
    return browser.tabs.query({active: true, currentWindow: true});
}

async function setCurrentTab() {
    currentTab = (await getActiveTab())[0].id;
}

// Update current tab when another tab is activated
// This event doesn't react if window is changed, which is why we need the onFocusedChanged event as well
browser.tabs.onActivated.addListener(setCurrentTab);

browser.windows.onFocusChanged.addListener(setCurrentTab);

/*
 remove all identities that are leftover from a shutdown of the extension
 this is needed during development, all cases of a running browser should be covered elsewhere
 */

browser.contextualIdentities.query({})
    .then((identities) => {
        for (let identity of identities) {
            if(identity.name.startsWith("extension")){
                browser.contextualIdentities.remove(identity.cookieStoreId);
            }
        }
        console.log("Removed old identities");
    })

setCurrentTab()
    .then(() => browser.tabs.query({}))
    .then(tabs =>{
        for (let tab of tabs) {
            if(tab.url.startsWith("about:")) return;
            initializeCleanTab(tab.id);
        }
    })
    .catch(error => console.error(error))


/**
 * On closing of a tab, we remove the contextual identity as well as the Shadow Tab
 * @param tabId
 */
function removeContainer(tabId) {
    if(tabs[tabId] && tabs[tabId] instanceof TabInfo){
        tabs[tabId].removeContainerIfExists();
    }
}

// browser.tabs.onRemoved.addListener(removeContainer);


/**
 * When a shadow tab has completed loading, all its cookies are available for comparison with the original request
 * It is necessary for some reason to wait a little longer
 * TODO; replace tabs[] with object
 */
function isFinished(details){
    if (tabs[details.tabId] instanceof ShadowTab) {
        setTimeout(() => {
            tabs[tabs[details.tabId].originTab].evaluateRequests();
        }, 2000);
    }
}

browser.webNavigation.onCompleted.addListener(isFinished);
