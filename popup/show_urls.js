/*
The popup scripts run everytime the popup is opened. They can get access to the data from the background scripts only
via getBackgroundPage(). They can access the methods of the objects and the global methods of the background page.
They cannot do the same, however, for the objects received by runtime.message()
 */

let backgroundPage;

/**
 * Adds and removes class expanded from element, determining if the overflowing text is hidden or not.
 * @param event
 */
function toggleExpansion(event) {
  event.target.classList.toggle("expanded");
}

/**
 * Constructs the HTML for a web request object
 * @param request
 * @returns {*}
 */
function insertWebRequest(request) {
  function completeUrlElement(urlElement) {
    urlElement.innerHTML = request.content;
    urlElement.className = "url "
    urlElement.addEventListener("click", toggleExpansion)
  }

  function createCookieElement(cookie) {
    let cookieElement = document.createElement("div");
    cookieElement.innerText = cookie.content;
    cookieElement.className = "cookie " + cookie.category + " " + request.category;
    cookieElement.addEventListener("click", toggleExpansion)
    return cookieElement;
  }

  /**
   * The details HTML element can be opened to display the identifying cookies.
   * Append each identifying cookie as an individual element
   */
  function listCookies() {
    requestElement = document.createElement("details");
    let summary = document.createElement("summary");
    completeUrlElement(summary)
    requestElement.appendChild(summary)

    for (let cookie of request.cookies) {
      let cookieElement = createCookieElement(cookie);
      requestElement.appendChild(cookieElement);
    }

    return requestElement
  }

  function listOnlyUrl() {
    requestElement = document.createElement("div");
    completeUrlElement(requestElement);
    return requestElement
  }

  let requestElement;

  // If there are cookies, list them. Otherwise just insert the element as a plain div
  if (request.cookies.length > 0) {
    requestElement = listCookies();
  } else {
    requestElement = listOnlyUrl();
  }
  /*
  For requests without cookies, the requestElement will also have the class "url". For requests with cookies
  the "url" class will instead be assigned to a sub element, the summary.
   */
  requestElement.className += request.category + " " + request.partyString;

  return requestElement;
}

function insertJSCookie(domain, cookie){
  if(cookie.mode === "javascript"){
    let cookieElement = document.createElement("div");
    cookieElement.innerText = domain + " - " + cookie.content;
    cookieElement.className = "cookie " + cookie.category + " " + request.category;
    cookieElement.addEventListener("click", toggleExpansion)

    document.getElementById("cookies").appendChild(cookieElement);

  }
}

function insertRequest(request) {
  let node = insertWebRequest(request);
  document.getElementById("request-urls").appendChild(node);
}

function insertResponse(response) {
  let node = insertWebRequest(response);
  document.getElementById("response-urls").appendChild(node);
}


/**
 * Sets the statistics shown on the top of the popup
 * @param tab
 */
function setStats(tab){
  try{
    document.getElementById("requests").innerHTML = (tab.requests.length + tab.responses.length).toString();
    document.getElementById("basic-tracking").innerHTML = (document.querySelectorAll("details.basic-tracking").length).toString();
    document.getElementById("tracking-by-tracker").innerHTML = (document.querySelectorAll("details.tracking-by-tracker").length).toString();
    document.getElementById("third-syncing").innerHTML = (document.querySelectorAll("details.third-syncing").length).toString();
    document.getElementById("first-syncing").innerHTML = (document.querySelectorAll("details.first-syncing").length).toString();
    document.getElementById("forwarding").innerHTML = (document.querySelectorAll("details.forwarding, .url.forwarding").length).toString();
    document.getElementById("analytics").innerHTML = (document.querySelectorAll("details.analytics, .url.analytics").length).toString();
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Hides the non loaded requests
 */
function constructLoadingScreen() {
  document.getElementById("status").style.display = "block";
  document.getElementById("analyser").style.display = "none";
}

/**
 * To fill in the content of the popup, clean all leftovers from previous page loads and set the new content
 */
function constructAnalysis() {
  document.getElementById("status").style.display = "none";
  document.getElementById("analyser").style.display = "block";

  document.getElementById("request-urls").innerHTML = "";
  document.getElementById("response-urls").innerHTML = "";
  document.getElementById("cookies").innerHTML = "";


  // inset all requests/responses collected so far
  backgroundPage.browserTabs.currentTab.requests.forEach((request) => insertRequest(request));
  backgroundPage.browserTabs.currentTab.responses.forEach((response) => insertResponse(response));
  backgroundPage.browserTabs.currentTab.domains.forEach((domain) => {
    domain.cookies.forEach(cookie => insertJSCookie(domain.name, cookie))
  });
}


function constructHeader() {
  //Set page to blank if not an analysable page
  // if in an administrative tab of firefox, or a newly opened one

  if(backgroundPage.browserTabs.currentTab === undefined){
    document.getElementById("no-page").style.display = "block";
    document.getElementById("everything").style.display = "none";
  }

  let page = backgroundPage.browserTabs.currentTab.domain;

  // if shadowTabId exists, it is a OriginTab. Instanceof does not work for some reason
  if(backgroundPage.browserTabs.currentTab.shadowTabId){
    // set page and clean content of the request/response windows
    document.getElementById("current-page").innerHTML = "Page: " + page
    document.getElementById("button").innerText = "Show Shadow Tab"
  } else {
    document.getElementById("current-page").innerHTML = "Page is Shadow for " + page
    document.getElementById("button").innerText = "Hide Shadow Tab"
  }
}

/**
 * For the shadow tabs hide the analysis section and display all the requests immediatly, in the assumption that the
 * popup in the shadow tab is only opened quite late
 * For the origin tab show the analysis section and either fill in the content or set a loading screen.
 */
function constructContent() {
  function constructShadowContent() {
    document.getElementById("origin").style.visibility = "hidden";
    // check if the analysis has already finished
    if(DEBUG_MODE){
      constructAnalysis();
    } else {
      document.getElementById("analyser").style.display = "none";
    }
  }

  function constructOriginContent() {
    // check if the analysis has already finished
    document.getElementById("origin").style.visibility = "visible";

    if (backgroundPage.browserTabs.currentTab.isEvaluated()) {
      constructAnalysis();
    } else {
      constructLoadingScreen();
    }
    setStats(backgroundPage.browserTabs.currentTab);

  }

  getDebugMode();
  if(backgroundPage.browserTabs.currentTab.shadowTabId){
    constructOriginContent();
  } else{
    constructShadowContent();
  }
}

/**
 * retrieves from local storage, if extension is in Debug mode, and should display more information
 */
function getDebugMode(){
  let debug = browser.storage.local.get('debug');
  debug.then((res) => {
    // to make debug mode default
    if(res.debug === undefined) {
      DEBUG_MODE = true;
    } else {
      DEBUG_MODE = res.debug;
    }
  });
}

/**
 * Sets up the Popup page from scratch each time the popup is opened or the window is reloaded
 * If the analysis of the page has been finished it is inserted, else there is only the waiting screen
 */
function constructPage() {
  // Set current tab in case the popup is opened without a tab being activated

  backgroundPage.browserTabs.setCurrentTab().then(()=>{
    constructHeader()
    constructContent()
  });
}

/**
 * THe very first time the page is constructed, we first retrieve the background page to get access to all the data
 */
function constructPageFromScratch() {
  browser.runtime.getBackgroundPage()
      .then( (page) => {
        backgroundPage = page;
        constructPage();
      });
}

function switchTab(event) {
  /**
   * Make origin tab visible, then hide shadow tab. Finally start evaluation process, in case user interaction caused changes in the shadow tab
   */
  function switchToOriginTab() {
    let shadowTabID = backgroundPage.browserTabs.currentTab.tabId;
    let originTabID = backgroundPage.browserTabs.currentTab.originTab;
    browser.tabs.update(originTabID, {active: true})
        .then(() => {
          return browser.tabs.hide(shadowTabID)
        })
        .then(() => {
          constructPageFromScratch();
          backgroundPage.browserTabs.evaluateTab(shadowTabID);
        });
  }

  function switchToShadowTab() {
    let shadowTabId = backgroundPage.browserTabs.currentTab.shadowTabId;
    browser.tabs.update(shadowTabId, {active: true})
        .then(() => constructPageFromScratch());
  }

  // if clicked "Hide Shadow Tab", as shadow tab has field originTab, while originTab does not
  if(backgroundPage.browserTabs.currentTab.originTab) {
    switchToOriginTab();
  } else {
    switchToShadowTab();
  }
}


/**
 * Whenever the popup receives a valid message from the background scripts, it rebuilds the page
 */
function evaluateMessage(message) {
  if (message.analysis || message.reload) {
    constructPage()
  }
}

browser.runtime.onMessage.addListener(evaluateMessage);

let DEBUG_MODE = true; // defaults to true
document.getElementById("button").addEventListener("click", switchTab);

// gets the backgroundPage once on opening
constructPageFromScratch();