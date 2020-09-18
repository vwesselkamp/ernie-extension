var thirdParty_mode = false;


function insertUrl(url, domain, party) {
  let node = document.createElement("LI");
  node.appendChild(document.createTextNode(domain + " : " + url));
  node.className = party;
  if(party == "first") {
    hideElement(node);
  }
  document.getElementById("urls").appendChild(node);
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

function setStats(tab){
  document.getElementById("requests").innerHTML = tab.requests.length;
  document.getElementById("third").innerHTML = document.getElementsByClassName("third").length.toString();
  let send = 0;
  tab.requests.forEach((request) => {
    // console.log(request.url)
    // console.log(request.cookies.length)
    send += request.cookies.length;
  })
  document.getElementById("cookies-send").innerHTML = send.toString();
  let set = 0;
  tab.responses.forEach((response) => {
    set += response.cookies.length;
  })
  document.getElementById("cookies-set").innerHTML = set.toString();

}
// when popup is opened, the data is fetched form the background script and inserted into the html
var getting = browser.runtime.getBackgroundPage();
getting.then((page) => {
  document.getElementById("current-page").innerHTML = "Page: " + page.tabs[page.currentTab].domain;
  page.tabs[page.currentTab].requests.forEach((request, i) => { // error if Tab not initilized
    insertUrl(request.url, request.domain, request.party);
  });
  setStats(page.tabs[page.currentTab]);
});


document.getElementById("thirdParty_button").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "Third Party Requests";
  thirdParty_mode = true;
  toggleMode()
});

document.getElementById("all").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "All Requests";
  thirdParty_mode = false;
  toggleMode();
});

browser.runtime.onMessage.addListener((message) => {
  insertUrl(message.request.url, message.request.domain, message.request.party);
});
