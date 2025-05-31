#!/usr/bin/env node

const fetch = require('node-fetch');

// Google Drive Service functions (copied from backend)
const extractFolderId = async (shareUrl) => {
  try {
    console.log(`🔍 Extracting folder ID from: ${shareUrl}`);
    
    // URLからフォルダIDを抽出するための正規表現パターン
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]+)(?:\?|$)/, // フォルダURLから（より柔軟）
      /\/drive\/folders\/([a-zA-Z0-9_-]+)(?:\?|$)/, // 共有URLから（より柔軟）
      /id=([a-zA-Z0-9_-]+)/, // id=パラメータから
      /\/folders\/([a-zA-Z0-9_-]{33})/, // 従来の33文字ID
      /([a-zA-Z0-9_-]{33,})/, // 33文字以上のID
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = shareUrl.match(pattern);
      if (match && match[1]) {
        console.log(`✅ Pattern ${i + 1} matched: ${match[1]}`);
        return match[1];
      } else {
        console.log(`❌ Pattern ${i + 1} no match: ${pattern}`);
      }
    }

    throw new Error('Google DriveのフォルダIDを抽出できませんでした');
  } catch (error) {
    console.error(`❌ Error extracting folder ID: ${error.message}`);
    throw new Error('共有URLからフォルダIDの抽出に失敗しました');
  }
};

const testFolderAccess = async (folderId) => {
  try {
    console.log(`\n🌐 Testing folder access for ID: ${folderId}`);
    
    const testUrl = `https://drive.google.com/drive/folders/${folderId}`;
    console.log(`📡 Fetching: ${testUrl}`);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      throw new Error(`フォルダにアクセスできません (ステータス: ${response.status}). 共有設定を確認してください。`);
    }

    const html = await response.text();
    console.log(`📄 HTML length: ${html.length} characters`);
    
    // HTMLの内容をチェック
    const checks = [
      { pattern: 'You need permission', message: '❌ Permission required' },
      { pattern: 'Request access', message: '❌ Access request needed' },
      { pattern: 'Sign in', message: '❌ Sign in required' },
      { pattern: 'data-id', message: '✅ Contains file data' },
      { pattern: '"id":', message: '✅ Contains JSON data' },
      { pattern: 'video/', message: '✅ Contains video files' },
    ];

    console.log(`\n🔍 HTML Content Analysis:`);
    checks.forEach(check => {
      if (html.includes(check.pattern)) {
        console.log(`  ${check.message}: Found "${check.pattern}"`);
      }
    });

    return { html, accessible: true };
  } catch (error) {
    console.error(`❌ Error testing folder access: ${error.message}`);
    return { html: '', accessible: false, error: error.message };
  }
};

const searchForVideoFiles = (html) => {
  console.log(`\n🎬 Searching for video files in HTML...`);
  
  // ファイル情報を抽出するための複数の正規表現パターン
  const filePatterns = [
    {
      name: 'Pattern 1 (ID,name,type,size)',
      regex: /"([\w-]{33,})",\["(.*?)","(.*?)","(.*?)"/g
    },
    {
      name: 'Pattern 2 (Array format)',
      regex: /\["([\w-]{33,})","([^"]*?)","([^"]*?)"/g
    },
    {
      name: 'Pattern 3 (JSON format)',
      regex: /"id":"([\w-]{33,})"[^}]*"name":"([^"]*?)"[^}]*"mimeType":"([^"]*?)"/g
    },
    {
      name: 'Pattern 4 (Simple video search)',
      regex: /"([\w-]{25,})"[^"]*"[^"]*"(video\/[^"]*?)"/g
    }
  ];

  const allFiles = [];
  const videoFiles = [];
  
  filePatterns.forEach((patternInfo, index) => {
    console.log(`\n  Testing ${patternInfo.name}:`);
    const pattern = new RegExp(patternInfo.regex.source, patternInfo.regex.flags);
    let match;
    let matchCount = 0;
    
    while ((match = pattern.exec(html)) !== null && matchCount < 10) {
      matchCount++;
      const [fullMatch, id, name, mimeType] = match;
      
      console.log(`    Match ${matchCount}:`);
      console.log(`      ID: ${id}`);
      console.log(`      Name: ${name || 'N/A'}`);
      console.log(`      Type: ${mimeType || 'N/A'}`);
      
      if (id && id.length >= 25) {
        const fileInfo = {
          id,
          name: name || `file-${id}`,
          mimeType: mimeType || 'unknown',
          downloadUrl: `https://drive.google.com/uc?export=download&id=${id}`,
        };
        
        allFiles.push(fileInfo);
        
        // 動画ファイルのみフィルタリング
        if (mimeType && mimeType.startsWith('video/')) {
          videoFiles.push(fileInfo);
          console.log(`      🎬 VIDEO FILE FOUND!`);
        }
      }
    }
    
    console.log(`    Total matches: ${matchCount}`);
  });

  console.log(`\n📊 Summary:`);
  console.log(`  Total files found: ${allFiles.length}`);
  console.log(`  Video files found: ${videoFiles.length}`);
  
  if (videoFiles.length > 0) {
    console.log(`\n🎬 Video Files:`);
    videoFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} (${file.mimeType})`);
      console.log(`     ID: ${file.id}`);
      console.log(`     Download: ${file.downloadUrl}`);
    });
  }

  return { allFiles, videoFiles };
};

const testCompleteFlow = async (shareUrl) => {
  console.log(`\n🚀 Testing complete Google Drive flow...`);
  console.log(`📎 URL: ${shareUrl}`);
  
  try {
    // Step 1: Extract folder ID
    console.log(`\n📋 Step 1: Extract Folder ID`);
    const folderId = await extractFolderId(shareUrl);
    console.log(`✅ Extracted ID: ${folderId} (length: ${folderId.length})`);
    
    // Step 2: Test folder access
    console.log(`\n📋 Step 2: Test Folder Access`);
    const accessResult = await testFolderAccess(folderId);
    
    if (!accessResult.accessible) {
      console.log(`❌ Cannot access folder: ${accessResult.error}`);
      return;
    }
    
    // Step 3: Search for video files
    console.log(`\n📋 Step 3: Search for Video Files`);
    const searchResult = searchForVideoFiles(accessResult.html);
    
    // Final summary
    console.log(`\n🎯 FINAL RESULT:`);
    if (searchResult.videoFiles.length > 0) {
      console.log(`✅ SUCCESS: Found ${searchResult.videoFiles.length} video files!`);
      searchResult.videoFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name}`);
      });
    } else {
      console.log(`❌ FAILED: No video files found in the folder`);
      console.log(`💡 Possible issues:`);
      console.log(`   - Folder is empty`);
      console.log(`   - Folder contains no video files`);
      console.log(`   - Different HTML structure than expected`);
      console.log(`   - Folder requires authentication`);
    }
    
  } catch (error) {
    console.error(`💥 Test failed: ${error.message}`);
  }
};

// Main execution
const main = async () => {
  console.log(`🧪 Google Drive URL Test Script`);
  console.log(`================================\n`);
  
  // Test the problematic URL
  const testUrl = 'https://drive.google.com/drive/folders/1PW9stHoptyV9-TqJmrlkAuIxr0VrGIZtRubmnMs0gURxq_qfxv3Gc7wRoZwVKlsrXS1m9Wt2?usp=sharing';
  
  await testCompleteFlow(testUrl);
  
  console.log(`\n🏁 Test completed!`);
};

// Run the test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  extractFolderId,
  testFolderAccess,
  searchForVideoFiles,
  testCompleteFlow
};