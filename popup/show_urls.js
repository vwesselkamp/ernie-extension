/*
The popup scripts run everytime the popup is opened. They can get access to the data from the background scripts only
via getBackgroundPage(). They can access the methods of the objects and the global methods of the background page.
They cannot do the same, however, for the objects received by runtime.message()
 */

let backgroundPage;


/**
 * Constructs the HTML for a web request object
 * TODO: Pull this into the WebRequest class
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
    summary.innerText = request.id + " - " + request.domain + " : " + request.url;
    requestElement.appendChild(summary)

    for (let cookie of request.cookies) {
      let cookieElement = document.createElement("div");
      cookieElement.innerText = cookie.key + ": " + cookie.value;

      let identifying = cookie.identifying ? "identifying" : "normal";
      let safe = cookie.safe ? "safe" : "normal";

      cookieElement.className = "cookie " + identifying + " " + safe;
      requestElement.appendChild(cookieElement);
    }
  }

  function listOnlyUrl() {
    requestElement = document.createElement("div");
    requestElement.innerText = request.id + " - " + request.domain + " : " + request.url;
  }

  let requestElement;

  // If there are identifying cookies, list them. Otherwise just insert the element as a plain div
  if (request.cookies.length > 0) {
    listCookies();
  } else {
    listOnlyUrl();
  }

  // category = type of tracking
  // party = first or third party request
  let party = request.thirdParty ? "third" : "first";
  requestElement.className = request.category + " " + party + " url";

  // if (request.party === "first") {
  //   hideElement(requestElement);
  // }
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
 * @param tab
 */
function setStats(tab){
  try{
    document.getElementById("requests").innerHTML = (tab.requests.length + tab.responses.length).toString();
    document.getElementById("basic-tracking").innerHTML = (document.getElementsByClassName("tracking").length-1).toString();
    document.getElementById("tracking-by-tracker").innerHTML = (document.getElementsByClassName("trackbytrack").length-1).toString();
    document.getElementById("3rd-syncing").innerHTML = (document.getElementsByClassName("third-syncing").length-1).toString();
    document.getElementById("1st-syncing").innerHTML = (document.getElementsByClassName("first-syncing").length-1).toString();
    document.getElementById("forwarding").innerHTML = (document.getElementsByClassName("forwarding").length-1).toString();
    document.getElementById("analyser").innerHTML = (document.getElementsByClassName("analysis").length-1).toString();

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
    document.getElementById("analysis").style.display = "none";
  }

  function constructAnalysis() {
    document.getElementById("status").style.display = "none";
    document.getElementById("analysis").style.display = "block";

    document.getElementById("request-urls").innerHTML = "";
    document.getElementById("response-urls").innerHTML = "";

    // inset all requests/responses collected so far
    backgroundPage.tabs[backgroundPage.currentTab].requests.forEach((request) => insertRequest(request));
    backgroundPage.tabs[backgroundPage.currentTab].responses.forEach((response) => insertResponse(response));
    setStats(backgroundPage.tabs[backgroundPage.currentTab]);
  }

  let page = backgroundPage.tabs[backgroundPage.currentTab].domain;
  // if in an administrative tab of firefox, or a newly opened one
  if(page == null){
    page = "Currently not a web page";
  }
  // set page and clean content of the request/response windows
  document.getElementById("current-page").innerHTML = "Page: " + page

  // check if the analysis has already finished
  if(backgroundPage.tabs[backgroundPage.currentTab].isEvaluated()){
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
        backgroundPage.setCurrentTab().then(constructPage);
      });
}