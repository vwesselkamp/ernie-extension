var thirdParty_mode = false;
var tabId;

function insertUrl(url, domain, party) {
 document.getElementById("urls").insertAdjacentHTML('beforeend', `
     <li class="` + party + ` url">
       <div>
        `+ party + ` : ` + domain + ` : `+ url + `
        </div>
     </li>`
   );
   window.scrollTo(0,document.body.scrollHeight);
   toggleMode();
}

//either hides all non relevant items or displays them
function toggleMode(){
  var divsToHide = document.getElementsByClassName("other");
  for(var i = 0; i < divsToHide.length; i++){
    if(thirdParty_mode){ //pull it up on the highest level?
      divsToHide[i].style.display = "none";
    } else {
      divsToHide[i].style.display = "block"
    }
  }
}

function handleWebRequest(message){
  if(message.request.webRequest.tabId == tabId){
    insertUrl(message.request.webRequest.url, message.request.domain, message.request.party);
  }
}

var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
gettingActiveTab.then((tabs) => {
	tabId = tabs[0].id;
	var getting = browser.runtime.getBackgroundPage();
	getting.then((page) => {
		document.getElementById("current-page").innerHTML = "Page: " + page.rootUrl;
		page.urlsByTab[tabId].forEach((request, i) => {
      insertUrl(request.webRequest.url, request.domain, request.party);
    });
	});
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

browser.runtime.onMessage.addListener(handleWebRequest);
