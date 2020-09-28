var thirdParty_mode = false;


function insertWebRequest(request) {
  let node;

  function listIdentifyingCookies() {
    node = document.createElement("details");
    let summary = document.createElement("summary");
    summary.innerText = request.domain + " : " + request.url;
    node.appendChild(summary)
    for (let i in request.cookies) {
      if (request.cookies[i].identifying) {
        let cookie = document.createElement("div");
        cookie.innerText = request.cookies[i].key;
        node.appendChild(cookie);
      }
    }
  }

  function listOnlyUrl() {
    node = document.createElement("div");
    node.innerText = request.domain + " : " + request.url;
  }

  if (request.cookies.filter(cookie => cookie.identifying === true).length > 0) {
    listIdentifyingCookies();
  } else {
    listOnlyUrl();
  }

  node.className = request.category + " " + request.party + " url";
  if (request.party === "first") {
    hideElement(node);
  }
  return node;
}

function insertRequest(request) {
  let node = insertWebRequest(request);
  document.getElementById("urls").appendChild(node);
}

function insertResponse(response) {
  let node = insertWebRequest(response);
  document.getElementById("response-urls").appendChild(node);
}

//either hides all non relevant items or displays them
function toggleMode(){
  const divsToHide = document.getElementsByClassName("first");
  for(let i = 0; i < divsToHide.length; i++){
    hideElement(divsToHide[i]);
  }
}

function hideElement(element) {
  if (thirdParty_mode) {
    element.style.display = "none";
  } else {
    element.style.display = "block"
  }
}

// currently static
function setStats(tab){
  try{
    document.getElementById("requests").innerHTML = (tab.requests.length + tab.responses.length).toString();
    document.getElementById("third").innerHTML = document.getElementsByClassName("third").length.toString();
    document.getElementById("basic-tracking").innerHTML = document.getElementsByClassName("tracking").length.toString();;
    document.getElementById("tracking-by-tracker").innerHTML = document.getElementsByClassName("trackbytrack").length.toString();;
  } catch (e) {
    console.warn(e);
  }
}

function constructPage() {
// when popup is opened, the data is fetched form the background script and inserted into the html
  document.getElementById("current-page").innerHTML = "Page: " + backgroundPage.tabs[backgroundPage.currentTab].domain;
  document.getElementById("urls").innerHTML = "";
  document.getElementById("response-urls").innerHTML = "";

  backgroundPage.tabs[backgroundPage.currentTab].requests.forEach((request, i) => { // error if Tab not initilized
    insertRequest(request);
  });
  backgroundPage.tabs[backgroundPage.currentTab].responses.forEach((response, i) => { // error if Tab not initilized
    insertResponse(response);
  });
  setStats(backgroundPage.tabs[backgroundPage.currentTab]);
}

var getting = browser.runtime.getBackgroundPage();
var backgroundPage;
getting.then(async (page) => {
  backgroundPage = page;
  backgroundPage.setCurrentTab().then(constructPage);
});


// document.getElementById("thirdParty_button").addEventListener("click", function(){
//   document.getElementById("popup-title").innerHTML = "3rd Party Requests";
//   thirdParty_mode = true;
//   toggleMode()
// });
//
// document.getElementById("all").addEventListener("click", function(){
//   document.getElementById("popup-title").innerHTML = "All Requests";
//   thirdParty_mode = false;
//   toggleMode();
// });

function evaluateMessage(message) {
  if (message.request) {
    insertRequest(message.request);
    setStats(backgroundPage.tabs[message.request.tabId]); // this is potentially very slow
  } else if (message.response) {
    insertResponse(message.response)
    setStats(backgroundPage.tabs[message.request.tabId]);
  } else if (message.reload) {
    constructPage();
  }
}

browser.runtime.onMessage.addListener(evaluateMessage);
