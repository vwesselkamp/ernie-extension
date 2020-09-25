var db;

// the version determines if the database is reinitaliyzed or updated
var request = indexedDB.open("extension-db", 10);

request.onerror = function(event) {
    console.log("error: database could not be initialized"); // if occurs
};
request.onsuccess = function(event) {
    db = event.target.result;
};

// database is constructed here
request.onupgradeneeded = function(event) {
    function initializeObjectStore() {
        try {
            // objectstore with autoincrementing key as we dont have a natural primary key for the cookies
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        } catch (e) {
            // if it already exists
            // when updating the schema it actually does have to be deleted, it says so in the docs
            console.warn(e);
            db.deleteObjectStore("cookies");
            console.warn("Reinitializing object store cookies.")
            return db.createObjectStore("cookies", {autoIncrement: "true"});
        }
    }

    function readCookiesIntoDB(text) {
        let lines = text.split("\n");
        lines.shift(); //remove title with URL ... Key
        // TODO: transaction lifetime is bit complicated, so find out how to keep cookieStore from outer scope alive
        // to use it here
        let cookieObjectStore = db.transaction("cookies", "readwrite").objectStore("cookies");
        lines.forEach((cookieData) => {
            if (cookieData === "") return;

            let words = cookieData.split(" ");
            let cookie = {url: getSecondLevelDomainFromDomain(words[0]), key: words[1]};
            cookieObjectStore.add(cookie);
        })
    }

    function parseCookieFile(){
        fetch('safe.txt')
            .then(response => {
                return response.text()
            })
            .then(readCookiesIntoDB);

    }

    console.info("Database upgraded");
    db = event.target.result;

    var objectStore = initializeObjectStore();

    // Create an index to search cookies by url. We may have duplicates
    // so we can't use a unique index.
    objectStore.createIndex("url", "url", { unique: false });

    // Use transaction oncomplete to make sure the objectStore creation is
    // finished before adding data into it.
    objectStore.transaction.oncomplete = parseCookieFile
};