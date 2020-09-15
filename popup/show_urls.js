let facebook = [
			"facebook.com",
			"facebook.net",
			"fbcdn.com",
			"fbcdn.net"
		]

var facebook_mode = false;
var tabId;

function insertUrl(url, owner) {
 document.getElementById("urls").insertAdjacentHTML('beforeend', `
     <li class="` + owner + ` url">
       <div>
        `+ url + `
        </div>
     </li>`
   );
   window.scrollTo(0,document.body.scrollHeight);
   toggleMode();
}

function checkIfOwnedByFB(url){
  for(let i= 0; i< facebook.length; i++){
    if(url.includes(facebook[i])){
      return "facebook";
    }
  }
  return "other";
}

function logURL(requestDetails) {
	if (requestDetails.tabId == tabId){
    insertUrl(requestDetails.url, checkIfOwnedByFB(requestDetails.url));
  }
}

function toggleMode(){
  var divsToHide = document.getElementsByClassName("other");
  for(var i = 0; i < divsToHide.length; i++){
    if(facebook_mode){
      divsToHide[i].style.display = "none";
    } else {
      divsToHide[i].style.display = "block"
    }
  }
}

var gettingActiveTab = browser.tabs.query({active: true, currentWindow: true});
gettingActiveTab.then((tabs) => {
	tabId = tabs[0].id;
	var getting = browser.runtime.getBackgroundPage();
	getting.then((page) => {
		Object.keys(page.urlsByTab[tabId]).forEach(function(key,index) {
	    insertUrl(key, page.urlsByTab[tabId][key]);
	  });
	});
});

document.getElementById("facebook_button").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "Facebook Requests";
  facebook_mode = true;
  toggleMode()
});

document.getElementById("all").addEventListener("click", function(){
  document.getElementById("popup-title").innerHTML = "All Requests";
  facebook_mode = false;
  toggleMode();
});

browser.webRequest.onBeforeRequest.addListener(
  logURL,
  {urls: ["<all_urls>"]}
);
