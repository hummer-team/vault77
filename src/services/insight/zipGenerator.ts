/**
 * ZIP file generator for report downloads
 * Uses JSZip to package multiple files into a single downloadable archive
 */

import JSZip from 'jszip';

/**
 * Content for a file to be added to ZIP
 */
export interface ZipContent {
  filename: string;
  content: string | Blob | Uint8Array;
}

/**
 * Generate and download ZIP file containing multiple files
 * @param files Array of files to include in ZIP
 * @param zipFilename Output ZIP filename (e.g., "report.zip")
 * @throws Error if files array is empty or ZIP generation fails
 */
export async function generateZip(
  files: ZipContent[],
  zipFilename: string,
): Promise<void> {
  if (files.length === 0) {
    throw new Error('[generateZip] No files to zip');
  }
  
  console.log(`[generateZip] Creating ZIP with ${files.length} files:`, 
    files.map(f => f.filename));
  
  try {
    const zip = new JSZip();
    
    // Add files to ZIP archive
    for (const file of files) {
      zip.file(file.filename, file.content);
    }
    
    // Generate ZIP blob with DEFLATE compression (level 6 = balanced)
    const blob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    
    console.log(`[generateZip] ZIP generated, size: ${(blob.size / 1024).toFixed(2)} KB`);
    
    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`[generateZip] Download triggered: ${zipFilename}`);
    
  } catch (error) {
    console.error('[generateZip] Failed to generate ZIP:', error);
    throw new Error(`ZIP generation failed: ${(error as Error).message}`);
  }
}
