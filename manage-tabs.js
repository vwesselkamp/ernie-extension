var currentTab;
// stores all tabs by their tabId as index
var tabs = [];

/*
Class to keep track ov everything happening in a tab, until a new link is clicked or the site is refreshed
 */
class TabInfo {
  constructor(url) {
    this.domain = getSecLevelDomain(url)
    this.requests = [];
    this.responses = [];
  }
}


setCurrentTab();


let querying = browser.tabs.query({});
querying.then(initializeAllTabs, onError);

function initializeAllTabs(tabs) {
  for (let tab of tabs) {
    initializeCleanTab(tab.id);
  }
}
// leaving it here because I don't know when these errors occur yet
function onError(error) {
  console.log(`Error: ${error}`);
}


browser.tabs.onCreated.addListener((tab) => {
  initializeCleanTab(tab.id);
});

// new Tab after clicking link, reloading or after strtup
// tabs -1 id
function initializeCleanTab(tabId) {
  if( tabId === -1 ) {
    return;
  }
  browser.tabs.get(tabId).then((tab) => {
    tabs[tabId] = new TabInfo(tab.url);
  })
}


browser.webNavigation.onBeforeNavigate.addListener(clearTabsData);

function clearTabsData(details){
  console.log("navigational event on " + details.url + " with frame id " + details.frameId)
  if(details.frameId !== 0) return;
  setCurrentTab(); // probably unnecessary

  tabs[details.tabId] = new TabInfo(details.url);
  console.log("cleared " + details.url)
}


// update current tab when the tab is activated
browser.tabs.onActivated.addListener(setCurrentTab);

function setCurrentTab() { // activeInfo also contains tabId
  getActiveTab().then((tabs) => {
    currentTab = tabs[0].id;
  });
}

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}