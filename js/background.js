/*
 * Background.js
 *
 */

/*
 * Set option to value
 */
function set(key, val) 
{ 
    val = JSON.stringify(val);
    localStorage.setItem(key, val);

    return val; 
}

/*
 * Get option value
 */
function get(key, def) 
{
    if (key in localStorage)
        return JSON.parse(localStorage.getItem(key));
    else
        return def;
}

/*
 * Clean options
 */
function clearConfig()
{
    localStorage.clear();
}

/*
 * Load configuration from local
 */
function loadConfig(reset)
{
    if (reset)
        clearConfig();

    return {
        'enable': get('enable', true),
        'cacheSize': get('cacheSize', 10),
        'copyOnSelect': get('copyOnSelect', true),
        'copyOnShiftSelect': get('copyOnShiftSelect', true),
        'copyOnSelectInBox': get('copyOnSelectInBox', false),
        'copyTitleRawFmt': get('copyTitleRawFmt', '%TITLE% - %URL%'),
        'copyTitleFmt': get('copyTitleFmt', '<a href="%URL%" title="%TITLE%" target="_blank">%TITLE%</a>'),
        'enableDebug': get('enableDebug', false),
        'storeCacheOnExit': get('storeCacheOnExit', true),
        'cache': get('cache', []),
        'showCopyNotification': get('showCopyNotification', true)
    };
}

/*
 * Update configuration
 */
function updateConfig()
{
    chrome.tabs.query({}, function(tabs) {
        debug('Send update config message to all tabs');

        for (var i in tabs) {
            chrome.tabs.sendMessage(tabs[i].id, {
                command: 'update', data: config
            });
        }
    });
}

/*
 * Debug function
 */
function debug(msg)
{
    if (config.enableDebug)
        this.console.log('[DEBUG] ' + msg);
}

/* Config object */
var config = loadConfig();
/* Copy cache */
var cache = config.cache;

/*
 * Do real copy work
 */
function doCopy(str, noCache)
{
    var sandbox = document.getElementById('sandbox');

    noCache = noCache || false;

    debug('Copy string: ' + str + ', no cache: ' + noCache);

    sandbox.value = str;
    sandbox.select();
    document.execCommand('copy');
    sandbox.value = '';

    /* Show copy notification */
    if (config.showCopyNotification) {
        var options = {
            type: 'basic',
            iconUrl: 'img/icon-32.png',
            //title: chrome.i18n.getMessage("notification_title"),
            title: "",
            message: str.substr(0, 35).split('\n')[0] + "..."
        };

        chrome.notifications.create('copy-notify', options, function () {});
        setTimeout(function() {
            chrome.notifications.clear('copy-notify', function () {});
        }, 3000);
    }

    if (!noCache) {
        /* Re-allocate cache space */
        if (cache.length == 2*config.cacheSize) {
            debug('Cache space is full, re-allocate it');
            cache = cache.slice(config.cacheSize, 2*config.cacheSize);
        }

        /* Push current copied string to cache */
        if (cache[cache.length - 1] != str)
            cache.push(str);
    }

    return str;
}    

/* Copy string to clipboard */
function copy(str, mode)
{
    if (str.match(/^(\s|\n)*$/) != null)
        return "";

    if (mode == 'cur-tau') {
        chrome.tabs.query(
            {'active': true, 'windowId': chrome.windows.WINDOW_ID_CURRENT},
            function (tabs) {
                var url = tabs[0].url;
                var title = tabs[0].title;

                str = str.replace(/%TITLE%/g, title).replace(/%URL%/g, url);
                doCopy(str);
            }
        );
    } else if (mode == 'all-tau') {
        chrome.tabs.query(
            {'windowId': chrome.windows.WINDOW_ID_CURRENT},
            function (tabs) {
                var url, title, value = "";

                for (var i in tabs) {
                    url = tabs[i].url;
                    title = tabs[i].title;

                    value += str.replace(/%TITLE%/g, title)
                            .replace(/%URL%/g, url) + '\n';
                }

                doCopy(value);
            }
        );
    } else {
        /* Trim leading and trailing newlines */
        str = str.replace(/^\n+|\n+$/, '');
        str = str.replace(/\xa0/g, ' ');

        doCopy(str, mode == 'no-cache');
    }
}

/*
 * Paste string to content scripts
 */
function paste(str)
{   
    debug('Paste from string: ' + str);
    copy(str, 'no-cache');

    chrome.tabs.query(
        {
            'active': true,
            'windowId': chrome.windows.WINDOW_ID_CURRENT
        },

        function(tabs) {
            debug('Send paste string to [' + tabs[0].title + ']');

            chrome.tabs.sendMessage(tabs[0].id, {
                command: 'paste', data: str
            });
        }
    );

    return str;
}


/*
 * Message passing between content script and backgroud page
 */
chrome.extension.onMessage.addListener(
    function(request, sender, sendResponse) {
        switch (request.command) {
            case 'copy':
                debug('Request to copy string from content script');
                copy(request.data, request.mode);
                break;
            case 'load':
                debug('Request to load config from content script');
                config = loadConfig();
                sendResponse(config);
                break;
            default:
                break;
        }
    }
);

/*
 * Store the cache when the window close
 */
if (config.storeCacheOnExit) {
    chrome.windows.onRemoved.addListener(function(windowId) {
        debug('Store the cache when exit');
        set('cache', cache);
    });
}
