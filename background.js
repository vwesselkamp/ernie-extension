var currentTab;
var tabs = [];

class TabInfo {
  constructor(tab) {
    this.domain = getSecLevelDomain(tab.url)
    this.requests = [];
    this.responses = [];
  }
}
class HttpInfo{

  constructor(webRequest) {
    this.url = webRequest.url;
    this.tabId = webRequest.tabId;
    this.domain = getSecLevelDomain(webRequest.url);
    this.party = this.checkIfThirdParty(); // move this function into the object?
    this.header = webRequest.requestHeaders;
    // this.cookies = extractCookie(this.header);
    // console.log(this.cookies)
  }

  checkIfThirdParty(){
    if(this.domain !== tabs[this.tabId].domain){
      return "third";
    }
    return "first";
  }
}

class RequestInfo extends HttpInfo{
  archive(tabId){
    tabs[tabId].requests.push(this);
    if (tabId === currentTab) {
      notifyPopupOfNewRequests(this);
    }
  }
}

class ResponseInfo extends HttpInfo{
  archive(tabId){
    tabs[tabId].responses.push(this);
  }
}

function Cookie(url, key, value){
  this.url = url;
  this.key = key;
  this.value = value;
}

function extractCookie(header) {
  header.forEach((attribute) => {
    // console.log(attribute.name);
    if (attribute.name == "Set-Cookie" || attribute.name == "Cookie") {
      //return extractCookieFromHeader(this.url, attribute.value);
      // console.log(attribute.value);
      return attribute.value;
    }
  })
  return null;
}

function extractCookieFromHeader(url, headerCookies){
  let cookies = [];
  // console.log(headerCookies);
  headerCookies.forEach((cookie) => {
    cookies.push(new Cookie(url, cookie.name, cookie.value))
  })
  return cookies;
}

function cleanTab(tabId) {
  browser.tabs.get(tabId).then((tab) => {
    tabs[tabId] = new TabInfo(tab);
  })
}

function logHeader(requestDetails, webRequest) {
  if(tabs[requestDetails.tabId] == undefined){
    cleanTab(requestDetails.tabId);
  } else if (requestDetails.originUrl == undefined){
    console.log("undefined request info " + requestDetails.url)
  }

  webRequest.archive(requestDetails.tabId);
}
function logRequest(requestDetails) {
  let request = new RequestInfo(requestDetails);
  logHeader(requestDetails, request);
}

function logResponse(responseDetails) {
  let response = new ResponseInfo(responseDetails);
  logHeader(responseDetails, response);
}

function clearTab(tabId, changeInfo, tabInfo){
  setCurrentTab();
  if(changeInfo.url && changeInfo.status == "loading") {
    cleanTab(tabId)
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

function notifyPopupOfNewRequests(request) {
  //Could not establish connection. Receiving end does not exist.
  //differntiate between if popup open or not? or simply handleError
  var sending = browser.runtime.sendMessage({
    request: request
  });

  function handleError() {
    return;
  }

  function handleResponse() {
    return;
  }

  sending.then(handleResponse, handleError);
}

const clearFilter = {
  properties: ["status"]
}


setCurrentTab();

function initializeAllTabs(tabs) {
  for (let tab of tabs) {
    cleanTab(tab.id);
  }
}

function onError(error) {
  console.log(`Error: ${error}`);
}

let querying = browser.tabs.query({});
querying.then(initializeAllTabs, onError);

// update when the tab is updated
browser.tabs.onUpdated.addListener(clearTab, clearFilter);
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