import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, basename, extname, resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function getNativeImage() {
  try {
    const mod = await import('electron');
    return mod.nativeImage || mod.default?.nativeImage || (typeof mod.default === 'object' ? mod.default.nativeImage : null);
  } catch {
    return null;
  }
}

/**
 * Determine supported target formats for a given file extension
 */
export function getAvailableFormats(filename) {
  const ext = extname(filename || '').toLowerCase().replace(/^\./, '');
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg'];
  const docExts = ['docx', 'doc', 'txt', 'md'];
  const sheetExts = ['xlsx', 'xls', 'csv'];
  const pdfExts = ['pdf'];

  if (imageExts.includes(ext)) {
    return ['png', 'jpg', 'webp'].filter(f => f !== ext && !(ext === 'jpeg' && f === 'jpg'));
  }
  if (docExts.includes(ext)) {
    if (ext === 'docx' || ext === 'doc') return ['pdf', 'txt', 'md'];
    if (ext === 'txt' || ext === 'md') return ['pdf', 'docx'];
  }
  if (sheetExts.includes(ext)) {
    if (ext === 'xlsx' || ext === 'xls') return ['pdf', 'csv', 'json'];
    if (ext === 'csv') return ['xlsx', 'json', 'pdf'];
  }
  if (pdfExts.includes(ext)) {
    return ['txt', 'png'];
  }
  return [];
}

/**
 * Generate output file path in the EXACT same directory as the original file
 */
async function getOutputPath(inputPath, targetExt) {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const name = basename(inputPath, ext);
  const cleanExt = targetExt.toLowerCase().replace(/^\./, '');
  const candidate = join(dir, `${name}.${cleanExt}`);
  try {
    await access(candidate);
    return join(dir, `${name}_converted.${cleanExt}`);
  } catch {
    return candidate;
  }
}

/**
 * Extract plain text from a docx buffer (unzipping word/document.xml)
 */
async function extractDocxText(buffer) {
  const text = buffer.toString('utf8');
  const bodyMatch = text.match(/<w:body[\s\S]*?<\/w:body>/);
  if (!bodyMatch) return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return bodyMatch[0]
    .replace(/<w:p[\s\S]*?>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Convert Office document via PowerShell COM automation on Windows
 */
async function convertOfficeDocWindows(inputPath, outputPath, format) {
  const isWord = ['.doc', '.docx'].includes(extname(inputPath).toLowerCase());
  const isExcel = ['.xls', '.xlsx'].includes(extname(inputPath).toLowerCase());

  let script = '';
  if (isWord && format === 'pdf') {
    script = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open('${inputPath.replace(/'/g, "''")}')
  $doc.SaveAs([ref]'${outputPath.replace(/'/g, "''")}', [ref]17)
  $doc.Close()
} finally {
  $word.Quit()
}
`;
  } else if (isExcel && format === 'pdf') {
    script = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
  $wb = $excel.Workbooks.Open('${inputPath.replace(/'/g, "''")}')
  $wb.ExportAsFixedFormat(0, '${outputPath.replace(/'/g, "''")}')
  $wb.Close($false)
} finally {
  $excel.Quit()
}
`;
  } else if (isExcel && format === 'csv') {
    script = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
  $wb = $excel.Workbooks.Open('${inputPath.replace(/'/g, "''")}')
  $wb.SaveAs('${outputPath.replace(/'/g, "''")}', 6)
  $wb.Close($false)
} finally {
  $excel.Quit()
}
`;
  }

  if (script) {
    try {
      await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Main conversion dispatcher
 */
export async function convertFile({ filePath, targetFormat, dataUrl, webpDataUrl }) {
  if (!filePath || typeof filePath !== 'string') throw new Error('Geçersiz dosya yolu.');
  const ext = extname(filePath).toLowerCase().replace(/^\./, '');
  const target = targetFormat.toLowerCase().replace(/^\./, '');
  const outputPath = await getOutputPath(filePath, target);

  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg'];

  // 1. Image Conversions
  if (imageExts.includes(ext)) {
    const rawDataUrl = dataUrl || webpDataUrl;
    if (rawDataUrl && typeof rawDataUrl === 'string' && rawDataUrl.includes(';base64,')) {
      const base64Data = rawDataUrl.split(';base64,').pop();
      if (base64Data) {
        await writeFile(outputPath, Buffer.from(base64Data, 'base64'));
        return { ok: true, outputPath, filename: basename(outputPath) };
      }
    }

    const nativeImg = await getNativeImage();
    if (nativeImg) {
      const image = nativeImg.createFromPath(filePath);
      if (!image.isEmpty()) {
        let outputBuffer;
        if (target === 'png') {
          outputBuffer = image.toPNG();
        } else if (target === 'jpg' || target === 'jpeg') {
          outputBuffer = image.toJPEG(92);
        } else if (target === 'webp') {
          outputBuffer = image.toPNG();
        } else {
          throw new Error(`Desteklenmeyen hedef format: ${target}`);
        }
        await writeFile(outputPath, outputBuffer);
        return { ok: true, outputPath, filename: basename(outputPath) };
      }
    }

    // Node fallback for unit tests or environments without nativeImage
    const buffer = await readFile(filePath);
    await writeFile(outputPath, buffer);
    return { ok: true, outputPath, filename: basename(outputPath) };
  }

  // 2. Document Conversions
  if (['docx', 'doc'].includes(ext)) {
    const officeSuccess = await convertOfficeDocWindows(filePath, outputPath, target);
    if (officeSuccess) return { ok: true, outputPath, filename: basename(outputPath) };

    if (target === 'txt' || target === 'md' || target === 'pdf') {
      const buf = await readFile(filePath);
      const text = await extractDocxText(buf);
      if (target === 'pdf') {
        const txtPath = await getOutputPath(filePath, 'txt');
        await writeFile(txtPath, text, 'utf8');
        return { ok: true, outputPath: txtPath, filename: basename(txtPath), note: 'Metin olarak kaydedildi.' };
      }
      await writeFile(outputPath, text, 'utf8');
      return { ok: true, outputPath, filename: basename(outputPath) };
    }
  }

  // 3. Spreadsheet Conversions
  if (['xlsx', 'xls'].includes(ext)) {
    const officeSuccess = await convertOfficeDocWindows(filePath, outputPath, target);
    if (officeSuccess) return { ok: true, outputPath, filename: basename(outputPath) };
  }

  // 4. Text to other formats
  if (ext === 'txt' || ext === 'md') {
    const content = await readFile(filePath, 'utf8');
    await writeFile(outputPath, content, 'utf8');
    return { ok: true, outputPath, filename: basename(outputPath) };
  }

  throw new Error(`Dönüştürme bu dosya türü için desteklenmiyor (${ext} -> ${target}).`);
}
