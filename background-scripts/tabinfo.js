class GenericTab {
    constructor(url, tabId) {
        this.url = url;
        this.tabId = tabId;
        this.domain = getSecondLevelDomainFromUrl(url)
        this.requests = [];
        this.responses = [];
        this.domains = [];
        this.redirects = [];

    }

    /**
     * @param id of a response
     * @param url of the same response
     * @returns the requests that belongs to the response
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
}

class ShadowTab extends GenericTab{
    constructor(url, tabId, origin) {
        super(url, tabId);
        this.originTab = origin;
    }
}

/**
 * Class to keep track of everything happening in a tab, until e.g. a new link is clicked or the site is refreshed
 * TODO: Refactor:
 * There is a duplication in the domain array and the response/request array.
 * From the request/response arrays I need the order of insertion for displaying, but the same requests are also saved
 * in the domains array under their respective domain.
 */
class TabInfo extends GenericTab{
    constructor(url, tabId) {
        super(url, tabId);
        this.evaluated = false;
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
            }).then(shadowTab => {
                console.info("Creating shadow Tab for " + this.url)
                tabs[this.shadowTabId] = new ShadowTab(this.url, this.shadowTabId, this.tabId);
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
            name: "extension-" + this.domain, // name doesn't have to be unique, as a unique id is assigned by the browser
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

    /**
     * Offline evaluation after the web page has finished loading
     * First all the cookies of the original and shadow request are compared and the identifying set as such
     * Then all categories are applied to all request/responses
     * This separates the phases cleanly, meaning that knowledge gained with a later requests can be applied
     * to change the category of an earlier request
     */
    evaluateRequests() {
        /**
         * Cookies are compared domain wide, meaning that if the domain of a request has a cookie in the same domain of the
         * shadow request, these are set. This also means, that the early requests are also classified correctly
         */
        function setIdentifyingCookies() {
            console.log("Comparing now " + this.url)
            console.log(tabs[this.shadowTabId])
            if (this.domains.length !== tabs[this.shadowTabId].domains.length) console.warn("Unequal amount of domains found")

            for (let domain of this.domains) {
                let shadowDomain = tabs[this.shadowTabId].domains.find(sd => sd.name === domain.name)
                if (shadowDomain) {
                    for (let cookie of domain.cookies) {
                        cookie.compareCookiesFromShadowRequest(shadowDomain.cookies);
                    }
                } else {
                    console.warn("No shadow domain found for " + domain.name)
                }
            }
        }

        function setBasicTracking() {
            for (let request of this.requests) {
                request.setBasicTracking();
            }
            for (let response of this.responses) {
                response.setBasicTracking();
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

        setIdentifyingCookies.call(this);

        setBasicTracking.call(this);
        setTrackingByTracker.call(this);
        setCookieSyncing.call(this);

        this.evaluated = true;
        this.notifyPopupOfAnalysis()
    }



    notifyPopupOfAnalysis() {
        const sending = this.constructMessageToPopup();

        sending
            .then()
            .catch(function (error) {
                // All requests are send, but can only be received if popup is open. This error is a result of this.
                // We can just drop it
                if(error.toString().includes("Could not establish connection. Receiving end does not exist.")){
                    return;
                }
                // Any error printed from here is likely because the popup expected another format from the message
                console.error(error);
            });
    }

    /**
     * Sends the request and
     * @returns {Promise<any>} that can be used to extract the answer. As the popup doesn't answer we don't care
     * about resolving
     */
    constructMessageToPopup() {
        return browser.runtime.sendMessage({
            analysis: true
        });
    }
}

/**
 * Class that keeps track of all requests of a certain domain, and provides fast information about the domains tracking
 * properties.
 */
class Domain {
    constructor(domain) {
        this.name = domain;
        this.tracker = false;
        this.cookies = [];
        this.requests = [];
        this.responses = [];
    }

    /**
     * saves request/response in the corresponding array
     */
    archive(request){
        this.cookies.push(...request.cookies)
        if (request instanceof Response){
            this.responses.push(request);
        } else if(request instanceof WebRequest){
            this.requests.push(request);
        }
    }

    setTracker(value){
        this.tracker = value;
    }
}
