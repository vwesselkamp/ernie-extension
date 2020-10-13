# Firefox Extension
## To use
Got to about:debugging in Firefox and add choose "Load temporary add-on", then choose any file from the extension.

The extension has a pop up window that appears when you click on the little policeman.

### Database
After analyzing a webpage, the extension will try to write the results to a local mongoDB via [restheart] (https://restheart.org/).
Restheart is a Java Program which exposes a local REST API for our mongoDB. 
If the extension cannot find a local mongoDB instance, it will not try to write to it, and the collected data will be lost when the tab is closed.

There is an API to access the IndexedDB of the browser from within the extension, however, the data in that DB can only be read by the creator (the extension) and is not accessible from outside the browser.
As I don't know how we are going to process the collected data, I chose to use an external database.

#### Set Up Database
Install mongoDB and restheart as described in their documentation. The default access is admin: secret.

To initialize the DB for the first time, run ```curl --user admin:secret -I -X PUT localhost:8080/```.   
To initialize the collection, run ```curl --user admin:secret -I -X PUT localhost:8080/extension```.

I intend to write a small script for this.

#### Using mongoDB
To access the data written by the extension, execute ```mongo``` to access the mongo shell.
Run ```use restheart``` to switch to our database.

To query for any visit that had tracking request, run ```db.extension.find( { "requests": { $elemMatch: { "category": "tracking"} } },{"domain": 1} )```   
To remove all data from our collection run ```db.extension.remove({})```
   
### Notes
The library for the public suffix list is this: https://github.com/lupomontero/psl  
It has last been updated in March. There exist alternatives where you can plug in the current list on your own.
### Resources
Trello Board: https://trello.com/b/EJ9rqFBZ   
Overleaf Documentation: https://de.overleaf.com/read/zyxspkfyqmwp