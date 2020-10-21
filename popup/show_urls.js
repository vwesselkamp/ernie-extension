/*
The popup scripts run everytime the popup is opened. They can get access to the data from the background scripts only
via getBackgroundPage(). They can access the methods of the objects and the global methods of the background page.
They cannot do the same, however, for the objects received by runtime.message()
 */

let backgroundPage;


function toggleExpansion(event) {
  event.target.classList.toggle("expanded");
}


/**
 * Constructs the HTML for a web request object
 * @param request
 * @returns {*}
 */
function insertWebRequest(request) {
  /**
   * The details HTML element can be opened to display the identifying cookies.
   * Append each identifying cookie as an individual element
   */
  function listCookies() {
    requestElement = document.createElement("details");
    let summary = document.createElement("summary");
    summary.innerText = request.content;
    summary.className = "url "
    summary.addEventListener("click", toggleExpansion)
    requestElement.appendChild(summary)

    //TODO: refactor class names
    for (let cookie of request.cookies) {
      let cookieElement = document.createElement("div");
      cookieElement.innerText = cookie.content;
      cookieElement.className = cookie.className + " " + request.category;
      cookieElement.addEventListener("click", toggleExpansion)
      requestElement.appendChild(cookieElement);
    }
  }

  function listOnlyUrl() {
    requestElement = document.createElement("div");
    requestElement.innerText = request.content;
    requestElement.className = "url "
    requestElement.addEventListener("click", toggleExpansion)
  }

  let requestElement;

  // If there are identifying cookies, list them. Otherwise just insert the element as a plain div
  if (request.cookies.length > 0) {
    listCookies();
  } else {
    listOnlyUrl();
  }
  requestElement.className += request.className

  return requestElement;
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
 * -1 so that the stat counter itself is not also counted
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

  // inset all requests/responses collected so far
  backgroundPage.browserTabs.currentTab.requests.forEach((request) => insertRequest(request));
  backgroundPage.browserTabs.currentTab.responses.forEach((response) => insertResponse(response));
}


function constructHeader() {
  if(backgroundPage.browserTabs.currentTab === undefined){
    document.getElementById("no-page").style.display = "block";
    document.getElementById("everything").style.display = "none";
  }

  let page = backgroundPage.browserTabs.currentTab.domain;
  // if in an administrative tab of firefox, or a newly opened one

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
    constructAnalysis();
  }

  function constructOriginContent() {
    // check if the analysis has already finished
    document.getElementById("origin").style.visibility = "visible";

    if (backgroundPage.browserTabs.currentTab.isEvaluated()) {
      constructAnalysis();
      setStats(backgroundPage.browserTabs.currentTab);
    } else {
      constructLoadingScreen();
      setStats(backgroundPage.browserTabs.currentTab);
    }
  }

  if(backgroundPage.browserTabs.currentTab.shadowTabId){
    constructOriginContent();
  } else{
    constructShadowContent();
  }
}

/**
 * Sets up the Popup page from scratch each time the popup is opened or the window is reloaded
 * If the analysis of the page has been finished it is inserted, else there is only the waiting screen
 */
function constructPage() {
  backgroundPage.browserTabs.setCurrentTab().then(()=>{
    constructHeader()

    constructContent()
  });
}

/**
 * Whenever the popup receives a message from the background scripts, it checks the type of message and acts accordingly
 */
function evaluateMessage(message) {
  if (message.analysis) {
    constructPage()
  } else if (message.reload) {
    constructPage();
  }
}

browser.runtime.onMessage.addListener(evaluateMessage);

// gets the backgroundPage once on opening
constructPageFromScratch();

function constructPageFromScratch() {
  browser.runtime.getBackgroundPage()
      .then( (page) => {
        backgroundPage = page;
        // Set current tab in case the popup is opened without a tab being activated
        backgroundPage.browserTabs.setCurrentTab().then(constructPage);
      });
}

function handleButtonClick(event) {
  if(backgroundPage.browserTabs.currentTab.originTab) {
    let tabID = backgroundPage.browserTabs.currentTab.tabId;
    let parentTabId = backgroundPage.browserTabs.currentTab.originTab;
    browser.tabs.update(parentTabId, { active: true})
        .then(()=>{
          browser.tabs.hide(tabID).then(()=> {
            constructPageFromScratch()
          });
        });

  } else {
    let shadowTabId = backgroundPage.browserTabs.currentTab.shadowTabId;
    browser.tabs.update(shadowTabId, { active: true})
        .then(()=>constructPageFromScratch());
  }
}

document.getElementById("button").addEventListener("click", handleButtonClick);