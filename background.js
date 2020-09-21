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

class Cookie{
  constructor (url, key, value) {
    this.url = url;
    this.key = key;
    this.value = value;
    this.checkIfIdCookie();
  }

  checkIfIdCookie(){
    var cookieStore = db.transaction(["cookies"]).objectStore("cookies");
    var cookieIndex = cookieStore.index("url");

    let result = cookieIndex.get(this.url);

    // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
    let scope = this;
    result.onsuccess = function(event) {
      if(event.target.result) {
        scope.identifying = event.target.result.key === scope.key;
      } else {
        scope.identifying = false;
      }
    }
  }
}


function handleIrregularities(requestDetails) {
  if(tabs[requestDetails.tabId] === undefined){
    console.log("New Tab at " + requestDetails.url)
  } else if (requestDetails.originUrl === undefined){ //TODO: when is this the case?
    console.log("undefined request info: " + requestDetails.url)
  }
}

function logRequest(requestDetails) {
  handleIrregularities(requestDetails);
  let request = new RequestInfo(requestDetails);
  request.archive(requestDetails.tabId);
}

function logResponse(responseDetails) {
  handleIrregularities(responseDetails);
  let response = new ResponseInfo(responseDetails);
  response.archive(responseDetails.tabId);
}


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


function clearTabsData(details){
  setCurrentTab(); // probably unnecessary

  tabs[details.tabId] = new TabInfo(details.url);
  console.log("cleared " + details.url)
}

function setCurrentTab() { // activeInfo also contains tabId
  getActiveTab().then((tabs) => {
    currentTab = tabs[0].id;
  });
}

function getSecLevelDomain(tabUrl){
  var url = new URL(tabUrl);
  url = url.hostname.split('.').splice(-2).join(".");
  return url;
}

function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}


setCurrentTab();

function initializeAllTabs(tabs) {
  for (let tab of tabs) {
    initializeCleanTab(tab.id);
  }

}

// leaving it here because I don't know when these errors occur yet
function onError(error) {
  console.log(`Error: ${error}`);
}

let querying = browser.tabs.query({});
querying.then(initializeAllTabs, onError);

// update when the tab is loading something new
const clearFilter = {
  properties: ["status"]
}

browser.tabs.onCreated.addListener((tab) => {
  initializeCleanTab(tab.id);
});

browser.webNavigation.onBeforeNavigate.addListener(clearTabsData);
// browser.tabs.onUpdated.addListener(clearTabsData, clearFilter);
// update when the tab is activated
browser.tabs.onActivated.addListener(setCurrentTab);

browser.webRequest.onSendHeaders.addListener(
    logRequest,
	{urls: ["<all_urls>"]},
  ["requestHeaders"]
);

browser.webRequest.onHeadersReceived.addListener(
    logResponse,
    {urls: ["<all_urls>"]},
    ["responseHeaders"]
);