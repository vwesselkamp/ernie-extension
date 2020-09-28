function getSecondLevelDomainFromDomain(url) {
    return psl.get(url); // look at a public suffix list and finds domains such as amazon.co.ukA
}

function getSecondLevelDomainFromUrl(tabUrl){
    var url = new URL(tabUrl);
    return getSecondLevelDomainFromDomain(url.hostname);
}

var Categories = Object.freeze({
    "BASICTRACKING":"tracking",
    "TRACKINGBYTRACKER":"trackbytrack",
    "NONE":"nothing"})


/*
  Superclass of all HTTP communication
 */
class HttpInfo{

    constructor(webRequest) {
        this.url = webRequest.url;
        this.tabId = webRequest.tabId;
        this.domain = getSecondLevelDomainFromUrl(webRequest.url);
        this.party = this.checkIfThirdParty(); // move this function into the object?
        this.cookies = [];
        this.category = Categories.NONE;
    }

    checkIfThirdParty(){
        if(this.domain !== tabs[this.tabId].domain){
            return "third";
        }
        return "first";

    }

    async extractFromHeader(header) {
        for (let i in header){
            this.findCookie(header[i]);
            this.findContentType(header[i]);
            this.findReferer(header[i]);
        }
        return this.checkForSafeCookies()
    }

    findContentType(attribute){
        if (attribute.name.toLowerCase() === "content-type"){
            this.contentType = attribute.value;
        }
    }

    checkForSafeCookies(){
        let request = this;
        var cookieIndex = db.transaction(["cookies"]).objectStore("cookies").index("url");

        // this is not an elegant solution, however i simply dont understand how onsuccess is assigned
        var indexRange = IDBKeyRange.only(getSecondLevelDomainFromUrl(this.url));
        return new Promise((resolve, reject) => {
            let idbRequest = cookieIndex.openCursor(indexRange)
            idbRequest.onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    for (let i in request.cookies) {
                        //TODO; fix this with "this" magic
                        request.cookies[i].checkIfIdCookie(request.cookies[i], cursor.value.key)
                    }
                    cursor.continue();
                } else {
                    resolve(request.cookies)
                }
            };
            idbRequest.onerror = event=> reject(event)
        })
    }

    findReferer(attribute) {
        if (attribute.name.toLowerCase() === "referer"){
            this.referer = getSecondLevelDomainFromUrl(attribute.value);
        }
    }

    //TODO: fix the this issue
    assignCategory() {
        const localFilter = this.filterIdCookies.bind(this);
        if(this.party === "third" && localFilter().length > 0){
            this.category = Categories.BASICTRACKING;
        }
        // the referers domain has tracked on this website before
        // and the request itself is tracking
        if(this.referer){
            // TODO: refactor this into something with a consistent order
            if (this.referer && tabs[this.tabId].signalizeTracker(this.referer)){
                console.log("Referer " + this.referer +" of " + this.url + " is tracker")
                if(this.category === Categories.BASICTRACKING && this.domain !== this.referer){
                    console.log("found new trackbytrack " + this.url)
                    this.category = Categories.TRACKINGBYTRACKER
                }
            }
        } else if (this instanceof RequestInfo){
            console.log("No referer found for " + this.url)
        }
    }

    filterIdCookies() {
        return this.cookies.filter(function (cookie) {
            return cookie.identifying === true;
        });
    }
}

/*
  Http request as reduced to the info we need.
 */
class RequestInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.requestHeaders;
        this.extractFromHeader(this.header)
            .then(() => {
                // all cookies are parsed and accessible at this point
                this.assignCategory();
                this.archive(this.tabId)
            })
    }

    archive(tabId){
        tabs[tabId].requests.push(this);
        tabs[tabId].pushWebRequest(this);
        if(this.category !== Categories.NONE){
            tabs[tabId].setTracker(this.domain);
        }
        if (tabId === currentTab) {
            this.notifyPopupOfNewRequests(this); // only request are shown in the extension popup for now
        }
    }

    notifyPopupOfNewRequests(request) {
        var sending = browser.runtime.sendMessage({
            request: request
        });

        sending
            .then()
            .catch(function (error) {
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                console.error(`Error: ${error}`);
            });
    }

    //for requests, all the cookies are send in one header attribute, if this is found, the cookies are extracted and returned
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "cookie") {
            // cookies are seperated by ; and the values defined after the first =
            let result = attribute.value
                .split(';')
                .map(v => v.split(/=(.+)/)); // TODO: returns emptz string as third parameter for some reason
            for (let i in result) {
                this.cookies.push(new Cookie(this.url, result[i][0].trim(), result[i][1]));
            }
        }
    }
}

class ResponseInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.responseHeaders;
        this.extractFromHeader(this.header).then(()=> {
            this.assignCategory();
            this.archive(this.tabId);
        });
    }

    archive(tabId){
        tabs[tabId].responses.push(this);
        tabs[tabId].pushWebRequest(this);
        if(this.category !== Categories.NONE){
            tabs[tabId].setTracker(this.domain);
        }

    }

    // for responses there can be several header attributes set cookies
    findCookie(attribute){
        if (attribute.name.toLowerCase() === "set-cookie") {
            let result = attribute.value
                .split(';', 1)
                .map(v => v.split(/=(.+)/));
            this.cookies.push(new Cookie(this.url, result[0][0], result[0][1]));
        }
    }
}


class Cookie{
    constructor (url, key, value) {
        this.url = url;
        this.key = key;
        this.value = value;
        this.identifying = true;
    }

    checkIfIdCookie(cookie, key){
        if (key === cookie.key) {
            cookie.identifying = false;
            console.info("Found safe cookie for " + cookie.url + ": " + cookie.key);
        }
    }
}