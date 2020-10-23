class GenericTab {
    /**
     * @param url{string} is the full URL of the main page
     * @param tabId{number}
     */
    constructor(url, tabId) {
        this.url = url;
        this.tabId = tabId;
        this.domain = getSecondLevelDomainFromUrl(url)
        this.requests = [];
        this.responses = [];
        this.redirects = [];
        this.domains = [];
    }

    /**
     * @param id of a response
     * @param url of the same response
     * @returns {WebRequest} the requests that belongs to the response
     */
    getCorrespondingRequest(url, id){
        if(id){
            return this.requests.find(request => request.id === id && request.url === url);
        } else {
            return this.requests.find(request => request.url === url);
        }
    }

    /**
     * @param name of a domain
     * @returns Domain if exists or creates new Domain and returns that
     */
    upsertDomain(name){
        let domain = this.domains.find(domain => domain.name === name);
        if(domain){
            return domain;
        }
        domain = new Domain(name);
        this.domains.push(domain);
        return domain;
    }

    get mainDomain(){
        return this.domains.find(domain => domain.name === this.domain);
    }

    /**
     * Stores the request/response it receives in the corresponding array, then sorts it into a domain
     */
    storeWebRequest(request){
        // the more specific class needs to be named first
        if (request instanceof Response) {
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
        let domain = this.upsertDomain(request.domain);
        domain.archive(request);
    }

    extendWebRequestCookies(domainName, cookies){
        let domain = this.upsertDomain(domainName);
        domain.addCookies(cookies);
    }

    markDomainAsTracker(domainName){
        let domain = this.upsertDomain(domainName)
        domain.setTracker(true);
    }

    isTracker(domainName) {
        let domain = this.domains.find(domain => domain.name === domainName);
        // This happens after a redirect, or if the isTracker() is called by a request that is the first from its domain.
        if(!domain){
            console.warn("Domain not yet initialized: " + domainName)
            return;
        }
        return domain.tracker;
    }

    addRedirect(redirect){
        this.redirects.push(redirect);
    }

    getRedirectsIfExist(requestId){
        let redirects = this.redirects.filter(redirect => redirect.id === requestId);
        if(redirects.length > 0){
            return redirects;
        }
    }

    createWebRequest(requestDetails){
        let webRequest = new WebRequest(requestDetails);
        this.storeWebRequest(webRequest);
    }

    createResponse(responseDetails){
        let response = new Response(responseDetails);
        this.storeWebRequest(response);
    }

    /**
     * For a response integrate the cookies in the corresponding request if possible
     * @param responseDetails
     * @returns {boolean}
     */
    integrateResponse(responseDetails){
        let request = this.getCorrespondingRequest(responseDetails.url, responseDetails.id);
        if(!request){
            console.warn("No corresponding request found for this response");
            return false;
        }
        request.integrateResponse(responseDetails);
        return true;
    }

    /**
     * If there are any cookies found in the cookie store at the end of a website loading, also store them in cookies
     * Since the same thing is not done for the background request, this is really not very useful at the moment.
     */
    logCookiesFromJavascript() {
        function removeLeadingDots(domainName) {
            while (domainName.charAt(0) === ".") domainName = domainName.substr(1);
            return domainName;
        }

        for(let domain of this.domains){
            this.getCookiesFromStore(domain.name).then(storageCookies => {
                if(this instanceof ShadowTab) console.log(storageCookies)

                for(let storageCookie of storageCookies){
                    let twin = domain.retrieveCookieIfExists(storageCookie.name, storageCookie.value)
                    if(!twin){
                        console.log("No corresponding cookie for \n " + JSON.stringify(storageCookie))
                        let strippedDomainName = removeLeadingDots(storageCookie.domain);
                        this.upsertDomain(getSecondLevelDomainFromDomain(strippedDomainName))
                            .addCookies([new Cookie(storageCookie.name, storageCookie.value, Cookie.Mode.JS)])
                    }
                }
            })
        }
    }

    getCookiesFromStore(domain){
        return browser.cookies.getAll({
            domain: domain
        })
    }
}

/**
 * Tab replicating behaviour of a regular tab in the background
 */
class ShadowTab extends GenericTab{
    /**
     * @param url{string}
     * @param tabId{number}
     * @param originTabId{number}
     * @param originDbId{number} the timestamp at which the origin tab was created, used as identifier in the database
     */
    constructor(url, tabId, originTabId, originDbId, cookieStoreID) {
        super(url, tabId);
        this.originTab = originTabId;
        this._id = originDbId
        this.cookieStoreID = cookieStoreID
    }

    getCookiesFromStore(domain){
        return browser.cookies.getAll({
            domain: domain,
            storeId: this.cookieStoreID
        })
    }
}

/**
 * Class to keep track of everything happening in a tab, until e.g. a new link is clicked or the site is refreshed
 * TODO: Refactor:
 * There is a duplication in the domain array and the response/request array.
 * From the request/response arrays I need the order of insertion for displaying, but the same requests are also saved
 * in the domains array under their respective domain.
 */
class OriginTab extends GenericTab{
    constructor(url, tabId) {
        super(url, tabId);
        this.evaluated = false;
        this._id = Date.now(); // this is used as an identifier for the database
        this.createContainer();
    }

    isEvaluated(){
        return this.evaluated;
    }

    /**
     * Creates a container for our shadow tab using the contextual identity API.
     * The container has its own cookieStore and a separate access to localStorage etc.
     * It also has a separated cache.
     */
    createContainer(){
        /**
         * Inside our container, a new hidden tab is created, that mirrors the request of the original tab
         * @param identity
         */
        function createShadowTab(identity) {
            browser.tabs.create({
                active: false, // this opens the tab in the background
                cookieStoreId: identity.cookieStoreId // this assigns the tab to our created contextual identity
            }).then(shadowTab => {
                this.shadowTabId = shadowTab.id;
                return browser.tabs.hide(shadowTab.id); // this hides the tab
            }).then(() => {
                console.info("Creating shadow Tab for " + this.url)
                browserTabs.addShadowTab(this.url, this.shadowTabId, this.tabId, this._id, identity.cookieStoreId);
                //update sets the url of the shadowTab to that of the original request
                return browser.tabs.update(this.shadowTabId, {
                    url: this.url
                })
            }).catch(e => {
                console.log(e)
                this.removeContainerIfExists(); // this covered by .call() below
            });
        }

        browser.contextualIdentities.create({
            name: "shadow-" + this.domain, // name doesn't have to be unique, as a unique id is assigned by the browser
            color: "purple", //these two attributes are meaningless to us
            icon: "briefcase"
          }).then(identity => {
              this.container = identity;
              console.info("Created container for " + this.domain)
              createShadowTab.call(this, identity);
          });
    }

    /**
     * remove contextual identity as well as corresponding shadow tab
     */
    removeContainerIfExists(){
        if(this.shadowTabId){
          browser.tabs.remove(this.shadowTabId).catch(e=>{
              console.log(e)
              console.log(this.domain)
          });
        }
        if(this.container){
            browser.contextualIdentities.remove(this.container.cookieStoreId)
                .then(()=>console.log("removed for " + this.domain))
                .catch((e) => console.log(e));
        }
    }

    static notifyPopupOfAnalysis() {
        const sending = OriginTab.constructMessageToPopup();

        sending
            .then()
            .catch(Tabs.onMessageRejected);
    }

    /**
     * Sends the request and
     * @returns {Promise<any>} that can be used to extract the answer. As the popup doesn't answer we don't care
     * about resolving
     */
    static constructMessageToPopup() {
        return browser.runtime.sendMessage({
            analysis: true
        });
    }

    /**
     * Offline evaluation after the web page has finished loading
     * First all the cookies of the original and shadow request are compared and the identifying set as such
     * Then all categories are applied to all request/responses
     * This separates the phases cleanly, meaning that knowledge gained with a later requests can be applied
     * to change the category of an earlier request
     */
    evaluateRequests() {
        function basicTracking() {
            for (let request of this.requests) {
                if (request.isBasicTracking()) {
                    request.category = Categories.BASICTRACKING;
                    browserTabs.getTab(request.browserTabId).markDomainAsTracker(request.domain);
                }
            }
            for (let response of this.responses) {
                if (response.isBasicTracking()) {
                    response.category = Categories.BASICTRACKING;
                    browserTabs.getTab(response.browserTabId).markDomainAsTracker(response.domain);
                }
            }
        }

        function setTrackingByTracker() {
            for (let request of this.requests) {
                request.setTrackingByTracker();
            }
            for (let response of this.responses) {
                response.setTrackingByTracker();
            }
        }

        function setCookieSyncing() {
            for (let request of this.requests) {
                request.setCookieSyncing();
            }
            for (let response of this.responses) {
                response.setCookieSyncing();
            }
        }

        function setCookieCharacteristics(){
            const promises = [];

            for(let domain of this.domains){
                promises.push(domain.setSafeCookiesForDomain()
                    .then(()=> domain.setIdentifyingCookies(this.shadowTabId)));
            }
            return Promise.all(promises);
        }


        this.logCookiesFromJavascript()
        browserTabs.getTab(this.shadowTabId).logCookiesFromJavascript()

        setCookieCharacteristics.call(this)
            .then(r => {
                basicTracking.call(this);
                setTrackingByTracker.call(this);
                setCookieSyncing.call(this);

                this.evaluated = true;
                OriginTab.notifyPopupOfAnalysis()
                sendTabToDB(this);
            })
    }
}
