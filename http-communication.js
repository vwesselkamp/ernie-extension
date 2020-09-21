
/*
  Superclass of all HTTP communication
 */
class HttpInfo{

    constructor(webRequest) {
        this.url = webRequest.url;
        this.tabId = webRequest.tabId;
        this.domain = getSecLevelDomain(webRequest.url);
        this.party = this.checkIfThirdParty(); // move this function into the object?
    }

    checkIfThirdParty(){
        if(this.domain !== tabs[this.tabId].domain){
            return "third";
        }
        return "first";

    }
}

/*
  Http request as reduced to the info we need.
 */
class RequestInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.requestHeaders;
        this.cookies = this.extractCookie(this.header);
    }

    archive(tabId){
        tabs[tabId].requests.push(this);
        if (tabId === currentTab) {
            this.notifyPopupOfNewRequests(this); // only request are shown in the extension popup for now
        }
    }

    notifyPopupOfNewRequests(request) {
        //TODO: Could not establish connection. Receiving end does not exist.
        //differntiate between if popup open or not? or simply handleError
        var sending = browser.runtime.sendMessage({
            request: request
        });

        function handleError() {
            //TODO
        }

        function handleResponse() {
            //TODO
        }

        sending.then(handleResponse, handleError);
    }

    //for requests, all the cookies are send in one header attribute, if this is found, the cookies are extracted and returned
    extractCookie(header) {
        let cookies = [];
        header.forEach((attribute) => {
            if (attribute.name.toLowerCase() === "cookie") {
                cookies = this.extractCookieFromHeader(this.url, attribute.value);
            }
        })
        return cookies;
    }

    extractCookieFromHeader(url, headerCookies){
        let cookies = [];
        // cookies are seperated by ; and the values defined after the first =
        let result = headerCookies
            .split(';')
            .map(v => v.split(/=(.+)/)); // TODO: returns emptz string as third parameter for some reason
        result.forEach((cookie) => {
            cookies.push(new Cookie(url, cookie[0], cookie[1]));
        });
        return cookies;
    }
}

class ResponseInfo extends HttpInfo{
    constructor(webRequest) {
        super(webRequest);
        this.header = webRequest.responseHeaders;
        this.cookies = this.extractCookie(this.header);
    }

    archive(tabId){
        tabs[tabId].responses.push(this);
    }

    // in responses there can be mutiple set-coockies, they are collected and returned at once
    extractCookie(header) {
        let cookies = [];
        header.forEach((attribute) => {
            if (attribute.name.toLowerCase() === "set-cookie") {
                cookies.push(this.extractCookieFromHeader(this.url, attribute.value));
            }
        })
        return cookies;
    }

    extractCookieFromHeader(url, headerCookies){
        let result = headerCookies
            .split(';', 1)
            .map(v => v.split(/=(.+)/)); // returns emptz string as third parameter for some reason
        return new Cookie(url, result[0][0], result[0][1]); // TODO ??
    }
}