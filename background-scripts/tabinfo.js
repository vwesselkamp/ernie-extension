/**
 * Class to keep track of everything happening in a tab, until e.g. a new link is clicked or the site is refreshed
 * TODO: Refactor:
 * There is a duplication in the domain array and the response/request array.
 * From the request/response arrays I need the order of insertion for displaying, but the same requests are also saved
 * in the domains array under their respective domain.
 */
class TabInfo {
    constructor(url) {
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
    getCorrespondingRequest(id, url){
        return this.requests.find(request => request.id === id && request.url === url);
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

/**
 * Class that keeps track of all requests of a certain domain, and provides fast information about the domains tracking
 * properties.
 */
class Domain {
    constructor(domain) {
        this.name = domain;
        this.tracker = false;
        this.requests = [];
        this.responses = [];
    }

    /**
     * saves request/response in the corresponding array
     */
    archive(request){
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
