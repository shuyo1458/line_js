// 全局配置
const Config = {
    // Debug 模式設置
    debug: {
        enabled: new URLSearchParams(window.location.search).get('debug') === 'true',
        defaultLineId: 'Ua29786ccf9d47bf757da14109d3a39c4',
        defaultClass: '0810'
    },
    
    // LINE 設置
    line: {
        liffId: '2006744038-9b0JexaR'
    }
}; 