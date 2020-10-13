/*
The popup scripts run everytime the popup is opened. They can get access to the data from the background scripts only
via getBackgroundPage(). They can access the methods of the objects and the global methods of the background page.
They cannot do the same, however, for the objects received by runtime.message()
 */

let backgroundPage;


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
    requestElement.appendChild(summary)

    for (let cookie of request.cookies) {
      let cookieElement = document.createElement("div");
      cookieElement.innerText = cookie.content;
      cookieElement.className = cookie.className;
      requestElement.appendChild(cookieElement);
    }
  }

  function listOnlyUrl() {
    requestElement = document.createElement("div");
    requestElement.innerText = request.content;
  }

  let requestElement;

  // If there are identifying cookies, list them. Otherwise just insert the element as a plain div
  if (request.cookies.length > 0) {
    listCookies();
  } else {
    listOnlyUrl();
  }
  requestElement.className = request.className

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
    document.getElementById("basic-tracking").innerHTML = (document.getElementsByClassName("basic-tracking").length-1).toString();
    document.getElementById("tracking-by-tracker").innerHTML = (document.getElementsByClassName("tracking-by-tracker").length-1).toString();
    document.getElementById("third-syncing").innerHTML = (document.getElementsByClassName("third-syncing").length-1).toString();
    document.getElementById("first-syncing").innerHTML = (document.getElementsByClassName("first-syncing").length-1).toString();
    document.getElementById("forwarding").innerHTML = (document.getElementsByClassName("forwarding").length-1).toString();
    document.getElementById("analysis").innerHTML = (document.getElementsByClassName("analysis").length-1).toString();

  } catch (e) {
    console.warn(e);
  }
}

/**
 * Sets up the Popup page from scratch each time the popup is opened or the window is reloaded
 * If the analysis of the page has been finished it is inserted, else there is only the waiting screen
 */
function constructPage() {

  function constructLoadingScreen() {
    document.getElementById("status").style.display = "block";
    document.getElementById("analyser").style.display = "none";
    setStats(backgroundPage.browserTabs.currentTab);
  }

  function constructAnalysis() {
    document.getElementById("status").style.display = "none";
    document.getElementById("analyser").style.display = "block";

    document.getElementById("request-urls").innerHTML = "";
    document.getElementById("response-urls").innerHTML = "";

    // inset all requests/responses collected so far
    backgroundPage.browserTabs.currentTab.requests.forEach((request) => insertRequest(request));
    backgroundPage.browserTabs.currentTab.responses.forEach((response) => insertResponse(response));
    setStats(backgroundPage.browserTabs.currentTab);
  }



  let page = backgroundPage.browserTabs.currentTab.domain;
  // if in an administrative tab of firefox, or a newly opened one
  if(page == null){
    page = "Currently not a web page";
  }

  if(backgroundPage.browserTabs.currentTab.originTab){
    document.getElementById("current-page").innerHTML = "Page is Shadow for " + page
    return;
  }
  // set page and clean content of the request/response windows
  document.getElementById("current-page").innerHTML = "Page: " + page

  // check if the analysis has already finished
  if(backgroundPage.browserTabs.currentTab.isEvaluated()){
    constructAnalysis();
  } else {
    constructLoadingScreen();
  }
}

/**
 * Whenever the popup receives a message from the background scripts, it checks the type of message and acts accordingly
 */
function evaluateMessage(message) {
  if (message.analysis) {
    constructPageFromScratch();
  } else if (message.reload) {
    constructPage();
  }
}

browser.runtime.onMessage.addListener(evaluateMessage);

// gets the backgroundPage once on opening
constructPageFromScratch();

function constructPageFromScratch() {
  browser.runtime.getBackgroundPage()
      .then(async (page) => {
        backgroundPage = page;
        // Set current tab in case the popup is opened without a tab being activated
        backgroundPage.browserTabs.setCurrentTab().then(constructPage);
      });
}