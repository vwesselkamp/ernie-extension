var currentTab;
// stores all tabs by their tabId as index
var tabs = [];
let lastNavigation = 0;

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

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}

function setCurrentTab() { // activeInfo also contains tabId
  getActiveTab().then((tabs) => {
    currentTab = tabs[0].id;
  });
}

setCurrentTab();


browser.tabs.query({})
    .then(tabs =>{
      for (let tab of tabs) {
        initializeCleanTab(tab.id);
      }
    })
    .catch(error => console.error(error))

browser.tabs.onCreated.addListener((tab) => {
  initializeCleanTab(tab.id);
});

// new Tab after clicking link, reloading or after strtup
// tabs -1 id
function initializeCleanTab(tabId) {
  if( tabId === -1 ) {
    return;
  }
  browser.tabs.get(tabId)
      .then((tab) => {
        tabs[tabId] = new TabInfo(tab.url);
      }).catch(error => console.error(error))
}


browser.webNavigation.onBeforeNavigate.addListener(clearTabsData);

function clearTabsData(details){
  if(details.frameId !== 0) {
    console.info("navigational event on " + details.url + " with frame id " + details.frameId)
    return;
  }
  // second onBeforeNavigate event is triggered on some websites after the first request is made
  // this doesn't happen to onCommited, however onCommited is to late, and misses the first request.
  // the check here is if to navigationalEvents happen really close to each other, then the second is probably irrelevant
  if (details.timeStamp - lastNavigation < 1000) {
    console.info("second navigational event to " + details.url);
    return;
  }

  lastNavigation = details.timeStamp;

  // setCurrentTab(); // probably unnecessary

  tabs[details.tabId] = new TabInfo(details.url);
  console.info("cleared tab for " + details.url);
  notifyPopupOfReload();

  function notifyPopupOfReload() {
    browser.runtime.sendMessage({
      reload: true
    })
        .then()
        // catching the error when the popup is not open to receive messages and just dropping it
        .catch(function (error) {
          if (error.toString().includes("Could not establish connection. Receiving end does not exist.")) {
            return;
          }
          console.error(`Error: ${error}`);
        });
  }
}


// update current tab when the tab is activated
browser.tabs.onActivated.addListener(setCurrentTab);