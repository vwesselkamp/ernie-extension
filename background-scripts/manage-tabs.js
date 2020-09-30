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
            tabs[browserTabId] = new TabInfo(tab.url);
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

    // if the Navigation happens in an iFrame on the page we don't care
    if(details.frameId !== 0) {
        console.info("Navigational event on " + details.url + " with frame id " + details.frameId)
        return;
    }

    setCurrentTab(); // probably unnecessary?

    tabs[details.tabId] = new TabInfo(details.url);
    console.info("Cleared tab for " + details.url);
    notifyPopupOfReload();
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

setCurrentTab()
    .then(() => browser.tabs.query({}))
    .then(tabs =>{
        for (let tab of tabs) {
            initializeCleanTab(tab.id);
        }
    })
    .catch(error => console.error(error))

