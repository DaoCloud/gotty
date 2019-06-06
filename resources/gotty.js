(function() {
    var httpsEnabled = window.location.protocol == "https:";
    var args = window.location.search;
    var url = (httpsEnabled ? 'wss://' : 'ws://') + window.location.host + window.location.pathname + 'ws';
    var protocols = ["gotty"];
    var autoReconnect = -1;

    var openWs = function() {
        var ws = new WebSocket(url, protocols);

        var term;

        var pingTimer;

        var setupHterm = function() {
            term = new hterm.Terminal();

            // set options
            // hterm >= 1.79 后，增加了 cursorVisible 的 option，但默认值为 false，这里需要设为 true。
            // 暂时没有找到更好的设置 options 的方法，就这么直接修改 term.options_ 了。
            term.options_.cursorVisible = true
    
            term.onTerminalReady = function() {
                var io = term.io.push();
    
                io.onVTKeystroke = function(str) {
                    ws.send("0" + str);
                };
    
                io.sendString = io.onVTKeystroke;
    
                io.onTerminalResize = function(columns, rows) {
                    ws.send(
                        "2" + JSON.stringify(
                            {
                                columns: columns,
                                rows: rows,
                            }
                        )
                    )
                };
            };
            term.decorate(document.getElementById("terminal"));

            // 为了兼容 FF 64，调整了 termainal 的渲染顺序，导致在 installKeyboard 前可能还没有准备好 terminal，所以这里需要延迟一段时间再 installKeyboard
            // https://github.com/chromium/hterm/commit/3dd57450f84e9e160a2f0166ecbc27f68643142f 
            setTimeout(function() {
                term.installKeyboard();
            }, 1000);
        }

        ws.onopen = function(event) {
            ws.send(JSON.stringify({ Arguments: args, AuthToken: gotty_auth_token,}));
            pingTimer = setInterval(sendPing, 30 * 1000, ws);

            // 保留之前 jiahui 修改的存储配置
            hterm.defaultStorage = new lib.Storage.Memory();
            hterm.defaultStorage.clear();

            lib.init(setupHterm)
        };

        ws.onmessage = function(event) {
            data = event.data.slice(1);
            switch(event.data[0]) {
            case '0':
                term.io.writeUTF8(window.atob(data));
                break;
            case '1':
                // pong
                break;
            case '2':
                term.setWindowTitle(data);
                break;
            case '3':
                preferences = JSON.parse(data);
                Object.keys(preferences).forEach(function(key) {
                    console.log("Setting " + key + ": " +  preferences[key]);
                    term.getPrefs().set(key, preferences[key]);
                });
                break;
            case '4':
                autoReconnect = JSON.parse(data);
                console.log("Enabling reconnect: " + autoReconnect + " seconds")
                break;
            }
        };

        ws.onclose = function(event) {
            if (term) {
                term.uninstallKeyboard();
                term.io.showOverlay("Connection Closed", null);
            }
            clearInterval(pingTimer);
            if (autoReconnect > 0) {
                setTimeout(openWs, autoReconnect * 1000);
            }
        };
    }


    var sendPing = function(ws) {
        ws.send("1");
    }

    openWs();
})()
