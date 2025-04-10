const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// 啟用 CORS
app.use(cors());

// 提供靜態檔案服務
app.use(express.static(path.join(__dirname, '../public')));

// 解析 JSON 請求體
app.use(express.json());

// 讀取設定檔
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/features.json')));

// Google Drive API 認證
const auth = new google.auth.GoogleAuth({ 
    credentials: config.googleDrive.credentials, 
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly'
    ]
});

// 初始化 Drive API
const drive = google.drive({ 
    version: 'v3', 
    auth,
    params: {
        supportsAllDrives: true,
        supportsTeamDrives: true
    }
});

// 讀取Google Drive文件
async function readDriveFile(fileId) {
    try {
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
            supportsAllDrives: true
        }, {
            responseType: 'text'
        });
        return response.data;
    } catch (error) {
        console.error('讀取文件失敗:', error.message);
        throw error;
    }
}

// 寫入Google Drive文件
async function writeDriveFile(fileId, data) {
    try {
        await drive.files.update({
            fileId: fileId,
            media: {
                mimeType: 'text/csv',
                body: data
            },
            supportsAllDrives: true
        });
        return true;
    } catch (error) {
        console.error('寫入文件失敗:', error.message);
        throw error;
    }
}

// LINE ID綁定
app.post('/api/bind', async (req, res) => {
    try {
        const { studentId, lineId, classId } = req.body;
        console.log('Received bind request:', { studentId, lineId, classId });
        
        if (!studentId || !lineId || !classId) {
            console.log('Missing required fields');
            return res.status(400).json({ success: false, message: '請提供學號、LINE ID和班級' });
        }

        // 驗證班級
        if (!['0810', '1012'].includes(classId)) {
            console.log('Invalid class ID:', classId);
            return res.status(400).json({ success: false, message: '無效的班級代碼' });
        }

        // 檢查 bindings 文件 ID 是否存在
        if (!config.googleDrive.files.bindings) {
            console.error('Bindings file ID not configured');
            return res.status(500).json({ success: false, message: '系統配置錯誤' });
        }

        // 讀取現有的綁定資料
        console.log('Reading existing bindings...');
        let bindings;
        try {
            bindings = await readDriveFile(config.googleDrive.files.bindings);
            console.log('Successfully read bindings file');
        } catch (error) {
            console.error('Error reading bindings file:', error);
            // 如果文件不存在，創建一個新的
            if (error.message.includes('not found')) {
                console.log('Creating new bindings file');
                bindings = '';
            } else {
                throw error;
            }
        }

        const bindingsData = bindings ? bindings.split('\n').filter(line => line.trim()).map(line => line.split(',')) : [];
        console.log('Current bindings count:', bindingsData.length);
        
        // 檢查是否已存在綁定
        const existingBinding = bindingsData.find(row => row[0] === studentId && row[3] === classId);
        if (existingBinding) {
            console.log('Binding already exists for student:', studentId);
            return res.status(400).json({ success: false, message: '該學號已綁定' });
        }

        // 添加新的綁定記錄，包含註冊時間
        const registerTime = new Date().toISOString();
        const newBinding = [studentId, lineId, registerTime, classId].join(',');
        const updatedBindings = bindings ? bindings + '\n' + newBinding : newBinding;

        // 寫入新的綁定資料
        console.log('Writing new binding to file...');
        await writeDriveFile(config.googleDrive.files.bindings, updatedBindings);
        console.log('Successfully wrote new binding');

        res.json({ success: true, message: '綁定成功' });
    } catch (error) {
        console.error('綁定錯誤:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: '綁定失敗，請稍後再試',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 學生資料查詢
app.get('/api/student/:classId/:studentId', async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        
        // 驗證班級
        if (!['0810', '1012'].includes(classId)) {
            return res.status(400).json({ success: false, message: '無效的班級代碼' });
        }

        // 讀取學生資料
        const students = await readDriveFile(config.googleDrive.files[classId]);
        const studentData = students ? students.split('\n').map(line => line.split(',')) : [];
        
        // 查找學生
        const student = studentData.find(row => row[0] === studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: '找不到該學號的資料' });
        }

        // 讀取綁定資料
        const bindings = await readDriveFile(config.googleDrive.files.bindings);
        const bindingsData = bindings ? bindings.split('\n').map(line => line.split(',')) : [];
        
        // 查找綁定資訊
        const binding = bindingsData.find(row => row[0] === studentId && row[3] === classId);
        
        // 準備回傳資料
        const data = {
            '學號': student[0],
            '姓名': student[1],
            'LINE ID': binding ? binding[1] : '未綁定',
            '註冊時間': binding ? binding[2] : '未綁定',
            '班級': classId === '0810' ? '0810班' : '1012班'
        };

        res.json({ success: true, data });
    } catch (error) {
        console.error('查詢錯誤:', error);
        res.status(500).json({ success: false, message: '查詢失敗，請稍後再試' });
    }
});

// 成績查詢功能
if (config.features.grades.enabled) {
    app.get('/api/grades/:classId/:studentId', async (req, res) => {
        try {
            const { classId, studentId } = req.params;
            
            // 驗證班級代號
            if (!['0810', '1012'].includes(classId)) {
                return res.status(400).json({
                    success: false,
                    message: '無效的班級代號'
                });
            }

            const grades = await readDriveFile(config.googleDrive.files.grades[classId]);
            const studentGrades = grades.filter(g => g.studentId === studentId);

            if (!studentGrades.length) {
                return res.status(404).json({ 
                    success: false, 
                    message: '找不到該學生的成績資料' 
                });
            }

            res.json({ success: true, data: studentGrades });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    app.get('/api/get-grade/:lineId/:classId', async (req, res) => {
        try {
            const { lineId, classId } = req.params;
            console.log('classId:', classId);
            
            // 使用 readBindings 讀取綁定信息
            console.log('Reading bindings for grade query...');
            const { rawData, bindings } = await readBindings();
            console.log('All bindings:', bindings);
            
            const binding = bindings.find(b => b.lineId === lineId);
            console.log('Found binding for lineId:', lineId, ':', binding);

            if (!binding) {
                console.log('No binding found for lineId:', lineId);
                return res.status(404).json({ error: '找不到綁定信息，請先完成學號綁定' });
            }

            // 根據班級ID選擇正確的 Google Drive URL
            let csvFileUrl;
            if (classId === '0810') {
                csvFileUrl = 'https://drive.google.com/uc?export=download&id=1ZT0d_icOk2mWA8NFjBFUgOA2QnuJWs6T';
            } else if (classId === '1012') {
                csvFileUrl = 'https://drive.google.com/uc?export=download&id=1NbjPlEHskTUM_D9tOUiTCvNMwgXj3GUx';
            } else {
                console.log('Invalid classId:', classId);
                return res.status(400).json({ error: '不支持的班級ID' });
            }

            // 獲取成績數據
            console.log('Fetching grades from URL:', csvFileUrl);
            const response = await axios.get(csvFileUrl, {
                timeout: 10000,
                headers: {
                    'Accept': 'text/csv',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            if (!response.data) {
                console.error('No data received from Google Drive');
                return res.status(500).json({ error: '無法從 Google Drive 獲取數據' });
            }

            const csvData = response.data;
            const rows = csvData.split('\n')
                .map(row => row.trim())
                .filter(row => row.length > 0);

            if (rows.length === 0) {
                console.error('No valid rows in CSV');
                return res.status(500).json({ error: '成績檔案格式錯誤' });
            }

            const headers = rows[0].split(',').map(h => h.trim());
            console.log('CSV headers:', headers);

            const studentData = rows.slice(1).map(row => {
                const values = row.split(',').map(v => v.trim());
                return {
                    學號: values[0],
                    姓名: values[1],
                    學期成績: values[2]
                };
            });

            console.log('Parsed student count:', studentData.length);

            // 檢查學號是否為特定值
            if (binding.studentId === '***') {
                const filteredData = studentData.map(student => ({
                    studentId: student.學號,
                    name: student.姓名,
                    classId: binding.classId,
                    grade: student.學期成績,
                    message: `${student.姓名}同學的學期成績為 ${student.學期成績}`
                }));
                
                const jsonData = JSON.stringify(filteredData, null, 2);
                return res.json(jsonData);
            }

            // 查找學生數據
            const student = studentData.find(s => 
                s.學號 && s.學號.toLowerCase() === binding.studentId.toLowerCase()
            );

            if (!student) {
                console.log('Student not found:', binding.studentId);
                return res.status(404).json({ error: '找不到學生數據' });
            }

            console.log('Found student:', student);
            const jsonData = JSON.stringify({        
                studentId: student.學號,
                name: student.姓名,
                classId: binding.classId,
                grade: student.學期成績,
                message: `${student.姓名}同學的學期成績為 ${student.學期成績}`
            });
            return res.json(jsonData);
        } catch (error) {
            console.error('Error in get-grade route:', error);
            res.status(500).json({ 
                error: '伺服器錯誤',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });
} else {
    // 如果成績查詢功能被禁用，返回錯誤信息
    app.get('/api/grades/:classId/:studentId', (req, res) => {
        res.status(403).json({
            success: false,
            message: '成績查詢功能已關閉'
        });
    });

    app.get('/api/get-grade/:lineId/:classId', (req, res) => {
        res.status(403).json({
            success: false,
            message: '成績查詢功能已關閉'
        });
    });
}

// 提供功能設置
app.get('/api/features', (req, res) => {
    try {
        // 確保 config 和 features 存在
        if (!config || !config.features) {
            throw new Error('Configuration not found');
        }
        
        // 返回功能設置
        res.json({
            features: config.features
        });
    } catch (error) {
        console.error('Error in /api/features:', error);
        res.status(500).json({
            error: '無法獲取功能設置',
            message: error.message
        });
    }
});

// 啟動服務器
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 