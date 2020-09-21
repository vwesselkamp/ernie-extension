var currentTab;
// stores all tabs by their tabId as index
var tabs = [];

/*
Class to keep track ov everything happening in a tab, until a new link is clicked or the site is refreshed
 */
class TabInfo {
  constructor(tab) {
    this.domain = getSecLevelDomain(tab.url)
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

  test(){
    console.log("test");
  }
  checkIfIdCookie(){
    var cookieStore = db.transaction(["cookies"]).objectStore("cookies");
    var cookieIndex = cookieStore.index("url");

    let result = cookieIndex.get("test.com");

    // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
    let scope = this;
    result.onsuccess = function(event) {
      scope.identifying = event.target.result.key === "uid";
      console.log(scope.identifying)
    }
  }
}


function handleIrregularities(requestDetails) {
  if(tabs[requestDetails.tabId] === undefined){
    console.log("New Tab")
    initializeCleanTab(requestDetails.tabId);
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

  browser.tabs.get(tabId).then((tab) => {
    tabs[tabId] = new TabInfo(tab);
  })
}


function clearTabsData(tabId, changeInfo, tabInfo){
  setCurrentTab();
  // if a new page call is made
  if(changeInfo.url && changeInfo.status == "loading") {
    initializeCleanTab(tabId)
    console.log("clearing " + tabInfo.url)
  }
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
browser.tabs.onUpdated.addListener(clearTabsData, clearFilter);
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