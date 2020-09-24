var db;

// the version determines if the database is reinitaliyzed or updated
var request = indexedDB.open("extension-db", 6);

request.onerror = function(event) {
    console.log("error: database could not be initialized"); // if occurs
};
request.onsuccess = function(event) {
    db = event.target.result;
};

// database is constructed here
request.onupgradeneeded = function(event) {
    console.info("database upgraded");
    var db = event.target.result;

    // objectstore with autoincrementing key as we dont have a natural primary key for the cookies
    var objectStore;
    try{
        objectStore = db.createObjectStore("cookies", { autoIncrement: "true" });
    } catch (e) {
        // if it already exists
        // when updating the schema it actually does have to be deleted, it says so in the docs
        console.warn(e);
        db.deleteObjectStore("cookies");
        objectStore = db.createObjectStore("cookies", { autoIncrement: "true" });
        console.warn("Reinitialized object store cookies.")
    }

    // Create an index to search cookies by url. We may have duplicates
    // so we can't use a unique index.
    objectStore.createIndex("url", "url", { unique: false });

    // Use transaction oncomplete to make sure the objectStore creation is
    // finished before adding data into it.
    objectStore.transaction.oncomplete = function(event) {
        // Store values in the newly created objectStore.
        parseCookieFile();
    };

    function parseCookieFile(){
        fetch('safe.txt')
            .then(response => {
                let text = response.text()
                    .then(text => {
                        let lines = text.split("\n");
                        lines.shift(); //remove title with URL ... Key
                        var cookieObjectStore = db.transaction("cookies", "readwrite").objectStore("cookies");
                        lines.forEach((cookieData) => {
                            if(cookieData === "") return;

                            let words = cookieData.split(" ");
                            let cookie = { url: getSecLevelDomain(words[0]), key: words[1] };
                            cookieObjectStore.add(cookie);
                        })
                    });
            })
    }
};