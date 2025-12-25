import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    
    let fileData: Uint8Array;
    let fileName = "file.pdf";
    let fileType = "application/pdf";

    if (contentType.includes("multipart/form-data")) {
      // Handle FormData upload
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = file.name;
      fileType = file.type;
      fileData = new Uint8Array(await file.arrayBuffer());
    } else {
      // Handle JSON with base64
      const body = await req.json();
      if (!body.fileData) {
        return new Response(
          JSON.stringify({ error: "No file data provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = body.fileName || "file.pdf";
      fileType = body.fileType || "application/pdf";
      
      // Decode base64
      const base64Data = body.fileData.split(",").pop() || body.fileData;
      fileData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    }

    console.log(`Processing file: ${fileName}, type: ${fileType}, size: ${fileData.length} bytes`);

    // Handle text files directly
    if (fileType === "text/plain" || fileName.endsWith(".txt")) {
      const text = new TextDecoder().decode(fileData);
      console.log(`Text file extracted: ${text.length} characters`);
      return new Response(
        JSON.stringify({ extractedText: text, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For PDFs, use a simple text extraction approach
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      const extractedText = extractTextFromPdfBytes(fileData);
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.log("PDF extraction returned empty, may be image-based PDF");
        return new Response(
          JSON.stringify({ 
            error: "PDF could not be parsed. This may be a scanned/image-based PDF. Please copy and paste the text manually.",
            extractedText: ""
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`PDF extracted: ${extractedText.length} characters`);
      return new Response(
        JSON.stringify({ extractedText, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unsupported file type. Please upload a PDF or TXT file." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing file:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to parse file",
        extractedText: ""
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simple PDF text extraction without external libraries
function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const pdfContent = decoder.decode(bytes);
  
  const textParts: string[] = [];
  
  // Method 1: Extract text from stream objects
  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  let match;
  
  while ((match = streamRegex.exec(pdfContent)) !== null) {
    const streamContent = match[1];
    
    // Look for text showing operators: Tj, TJ, '
    const tjMatches = streamContent.match(/\(([^)]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tjMatch of tjMatches) {
        const textMatch = tjMatch.match(/\(([^)]*)\)/);
        if (textMatch) {
          textParts.push(decodeEscapedText(textMatch[1]));
        }
      }
    }
    
    // TJ operator with array of strings
    const tjArrayMatches = streamContent.match(/\[((?:[^[\]]*|\[(?:[^[\]]*|\[[^\]]*\])*\])*)\]\s*TJ/g);
    if (tjArrayMatches) {
      for (const tjArray of tjArrayMatches) {
        const textMatches = tjArray.match(/\(([^)]*)\)/g);
        if (textMatches) {
          for (const tm of textMatches) {
            const text = tm.match(/\(([^)]*)\)/);
            if (text) {
              textParts.push(decodeEscapedText(text[1]));
            }
          }
        }
      }
    }
  }
  
  // Method 2: Look for BT...ET blocks (text blocks)
  const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
  while ((match = btEtRegex.exec(pdfContent)) !== null) {
    const block = match[1];
    
    // Extract Tj strings
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tjMatch of tjMatches) {
        const textMatch = tjMatch.match(/\(([^)]*)\)/);
        if (textMatch) {
          textParts.push(decodeEscapedText(textMatch[1]));
        }
      }
    }
  }

  // Clean and format the extracted text
  let result = textParts.join(" ");
  
  // Clean up common issues
  result = result
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
    .replace(/\s*-\s*/g, ' - ')
    .replace(/Chapter/gi, '\nChapter')
    .replace(/Unit/gi, '\nUnit')
    .trim();

  // Split into lines and clean
  const lines = result
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return lines.join('\n');
}

function decodeEscapedText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
