var currentTab;
// stores all tabs by their tabId as index
var tabs = [];

/*
Class to keep track ov everything happening in a tab, until a new link is clicked or the site is refreshed
 */
class TabInfo {
  constructor(url) {
    this.domain = getSecondLevelDomainFromUrl(url)
    this.requests = [];
    this.responses = [];
    this.domains = [];
  }

  updateDomain(name){
      let domain = this.domains.find(domain => domain.name === name);
      if(domain){
          return domain;
      }
      domain = new Domain(name);
      this.domains.push(domain);
      return domain;
  }

  pushWebRequest(request){
      let domain = this.updateDomain(request.domain);
      domain.archive(request);
  }

  setTracker(domainName){
      let domain = this.updateDomain(domainName)
      domain.tracker = true;
  }

  signalizeTracker(domainName) {
      let domain = this.domains.find(domain => domain.name === domainName);
      if(!domain){
          console.warn("Domain does not exists: " + domainName)
          return;
      }
      return domain.tracker;
  }

}

class Domain {
    constructor(domain) {
        this.name = domain;
        this.tracker = false;
        this.requests = [];
        this.responses = [];
        console.info("Initialized domain " + this.name)
    }

    archive(request){
        if(request instanceof RequestInfo){
            this.requests.push(request);
        } else if (request instanceof ResponseInfo){
            this.responses.push(request);
        }
    }
}
function getActiveTab() {
  return browser.tabs.query({active: true, currentWindow: true});
}

async function setCurrentTab() { // activeInfo also contains tabId
  currentTab = (await getActiveTab())[0].id;
}

setCurrentTab()
    .then(() => browser.tabs.query({}))
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
  setCurrentTab(); // probably unnecessary

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
// doesn"t react if window is changed
browser.tabs.onActivated.addListener(setCurrentTab);

browser.windows.onFocusChanged.addListener(setCurrentTab);
