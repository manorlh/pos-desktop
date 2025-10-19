import * as fs from "fs";
import * as iconv from "iconv-lite";
import * as path from "path";

/**
 * Convert file from ISO 8859-8-i to UTF-8 encoding
 * @param inputPath - Path to the input file (ISO 8859-8-i encoded)
 * @param outputPath - Path to the output file (UTF-8 encoded)
 */
function convertISO8859ToUTF8(inputPath: string, outputPath: string): void {
  try {
    // Read the file as ISO 8859-8-i encoded buffer
    const buffer = fs.readFileSync(inputPath);
    
    // Convert from ISO 8859-8-i to UTF-8
    const utf8Content = iconv.decode(buffer, "iso88598");
    
    // Write as UTF-8
    fs.writeFileSync(outputPath, utf8Content, "utf8");
    
    console.log(`✅ Converted: ${inputPath} → ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error converting ${inputPath}:`, error);
  }
}

/**
 * Convert multiple files from ISO 8859-8-i to UTF-8
 * @param inputDir - Directory containing ISO 8859-8-i files
 * @param outputDir - Directory to save UTF-8 files
 * @param fileExtensions - Array of file extensions to convert (default: ['.txt'])
 */
function convertDirectory(
  inputDir: string, 
  outputDir: string, 
  fileExtensions: string[] = ['.txt']
): void {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read all files in input directory
  const files = fs.readdirSync(inputDir);
  
  files.forEach(file => {
    const filePath = path.join(inputDir, file);
    const stat = fs.statSync(filePath);
    
    // Only process files (not directories)
    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      
      // Check if file extension matches what we want to convert
      if (fileExtensions.includes(ext)) {
        const outputPath = path.join(outputDir, file);
        convertISO8859ToUTF8(filePath, outputPath);
      }
    }
  });
}

/**
 * Convert specific files from the output directory
 */
function convertOutputFiles(): void {
  const outputDir = path.join(__dirname, "output");
  const utf8Dir = path.join(__dirname, "output-utf8");
  
  console.log("🔄 Converting output files from ISO 8859-8-i to UTF-8...");
  console.log(`Input directory: ${outputDir}`);
  console.log(`Output directory: ${utf8Dir}`);
  
  convertDirectory(outputDir, utf8Dir, ['.txt']);
  
  console.log("✅ Conversion complete!");
}

// Main execution
function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Default: convert all files in output directory
    convertOutputFiles();
  } else if (args.length === 2) {
    // Convert specific file
    const [inputPath, outputPath] = args;
    convertISO8859ToUTF8(inputPath, outputPath);
  } else if (args.length === 3) {
    // Convert directory
    const [inputDir, outputDir, extensions] = args;
    const extArray = extensions.split(',').map(ext => ext.startsWith('.') ? ext : `.${ext}`);
    convertDirectory(inputDir, outputDir, extArray);
  } else {
    console.log("Usage:");
    console.log("  npx tsx convert-encoding.ts                           # Convert output directory");
    console.log("  npx tsx convert-encoding.ts <input> <output>         # Convert single file");
    console.log("  npx tsx convert-encoding.ts <inputDir> <outputDir> <extensions>  # Convert directory");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx convert-encoding.ts");
    console.log("  npx tsx convert-encoding.ts input.txt output.txt");
    console.log("  npx tsx convert-encoding.ts ./input ./output txt,ini");
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { convertISO8859ToUTF8, convertDirectory, convertOutputFiles };



