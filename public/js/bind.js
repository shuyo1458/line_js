// LIFF 初始化
async function initializeLiff() {
    try {
        await liff.init({ liffId: "YOUR_LIFF_ID" });
        
        // 如果已經登入，直接獲取資料
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            showBindForm(profile.userId);
        }

        // 設置登入按鈕事件
        document.getElementById('lineLoginBtn').onclick = async () => {
            try {
                if (!liff.isLoggedIn()) {
                    await liff.login();
                }
                const profile = await liff.getProfile();
                showBindForm(profile.userId);
            } catch (err) {
                showError('LINE 登入失敗，請稍後再試');
            }
        };
    } catch (err) {
        showError('LIFF 初始化失敗，請稍後再試');
    }
}

// 顯示綁定表單
function showBindForm(lineId) {
    document.getElementById('loginContainer').classList.add('d-none');
    document.getElementById('bindForm').classList.remove('d-none');
    document.getElementById('lineId').value = lineId;
}

// 顯示錯誤訊息
function showError(message, isTest = false) {
    const resultDiv = document.getElementById(isTest ? 'testResult' : 'result');
    const alertDiv = resultDiv.querySelector('.alert');
    resultDiv.classList.remove('d-none');
    alertDiv.classList.add('alert-danger');
    alertDiv.textContent = message;
}

// 顯示成功訊息
function showSuccess(message, isTest = false) {
    const resultDiv = document.getElementById(isTest ? 'testResult' : 'result');
    const alertDiv = resultDiv.querySelector('.alert');
    resultDiv.classList.remove('d-none');
    alertDiv.classList.add('alert-success');
    alertDiv.textContent = message;
}

// 從URL獲取班級參數
const urlParams = new URLSearchParams(window.location.search);
const classId = urlParams.get('class');

// 驗證班級參數
if (!['0810', '1012'].includes(classId)) {
    window.location.href = 'index.html';
}

// 設置班級信息
document.getElementById('className').textContent = classId === '0810' ? '0810班' : '1012班';
document.getElementById('classId').value = classId;

// 測試表單提交處理
document.getElementById('testForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const studentId = document.getElementById('testStudentId').value;
    const lineId = document.getElementById('testLineId').value;
    
    try {
        const response = await fetch('/api/bind', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ studentId, lineId, classId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(result.message, true);
        } else {
            showError(result.message, true);
        }
    } catch (error) {
        showError('綁定失敗，請稍後再試', true);
    }
});

// 正式表單提交處理
document.getElementById('bindForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const studentId = document.getElementById('studentId').value;
    const lineId = document.getElementById('lineId').value;
    
    try {
        const response = await fetch('/api/bind', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ studentId, lineId, classId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(result.message);
        } else {
            showError(result.message);
        }
    } catch (error) {
        showError('綁定失敗，請稍後再試');
    }
});

// 初始化 LIFF
initializeLiff(); 