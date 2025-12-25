import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect garbage text (repeated characters, encoding issues)
function detectGarbageText(text: string): boolean {
  if (!text || text.length < 10) return true;
  
  // Check for repeated character patterns (like "nnnnnn" or "??????")
  const repeatedPattern = /(.)\1{5,}/g;
  const matches = text.match(repeatedPattern) || [];
  const repeatedChars = matches.join('').length;
  
  // If more than 30% of text is repeated chars, it's garbage
  if (repeatedChars / text.length > 0.3) return true;
  
  // Check for high ratio of non-printable or replacement characters
  const nonPrintable = (text.match(/[\uFFFD\u0000-\u001F]/g) || []).length;
  if (nonPrintable / text.length > 0.1) return true;
  
  // Check for too many consecutive same characters
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) return true;
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    
    let fileData: Uint8Array;
    let fileName = "file.pdf";
    let fileType = "application/pdf";

    if (contentType.includes("multipart/form-data")) {
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
      const body = await req.json();
      if (!body.fileData) {
        return new Response(
          JSON.stringify({ error: "No file data provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = body.fileName || "file.pdf";
      fileType = body.fileType || "application/pdf";
      
      const base64Data = body.fileData.split(",").pop() || body.fileData;
      fileData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    }

    console.log(`Processing file: ${fileName}, type: ${fileType}, size: ${fileData.length} bytes`);

    // Handle text files directly
    if (fileType === "text/plain" || fileName.endsWith(".txt")) {
      const text = new TextDecoder("utf-8").decode(fileData);
      console.log(`Text file extracted: ${text.length} characters`);
      return new Response(
        JSON.stringify({ extractedText: text, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For PDFs, use unpdf library (supports Unicode/Hindi)
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      try {
        const { getDocumentProxy } = await import("https://esm.sh/unpdf@0.11.0");
        
        const pdf = await getDocumentProxy(fileData);
        console.log(`PDF loaded: ${pdf.numPages} pages`);
        
        const textParts: string[] = [];
        const maxPages = Math.min(pdf.numPages, 30);
        
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent({
            includeMarkedContent: false,
          });
          
          // Extract text with proper Unicode handling
          let pageText = "";
          let lastY = -1;
          
          for (const item of textContent.items) {
            if ("str" in item && item.str) {
              // Add newline when Y position changes significantly (new line)
              if (lastY !== -1 && "transform" in item) {
                const currentY = (item as any).transform?.[5];
                if (currentY !== undefined && Math.abs(currentY - lastY) > 5) {
                  pageText += "\n";
                }
                lastY = currentY;
              } else if ("transform" in item) {
                lastY = (item as any).transform?.[5] || lastY;
              }
              
              pageText += item.str;
            }
          }
          
          if (pageText.trim()) {
            textParts.push(pageText.trim());
          }
        }
        
        let extractedText = textParts.join("\n\n");
        
        // Format for syllabus parsing
        extractedText = extractedText
          .replace(/Chapter/gi, '\nChapter')
          .replace(/Unit/gi, '\nUnit')
          .replace(/अध्याय/g, '\nअध्याय')
          .replace(/इकाई/g, '\nइकाई')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');

        console.log(`PDF extracted: ${extractedText.length} characters`);
        
        // Detect garbage output (repeated chars like "nnnn" or very short)
        const isGarbage = detectGarbageText(extractedText);
        const isEmpty = !extractedText || extractedText.length < 15;
        
        return new Response(
          JSON.stringify({ 
            extractedText: extractedText || "", 
            fileName,
            isEmpty,
            isGarbage,
            needsOcr: isEmpty || isGarbage
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        return new Response(
          JSON.stringify({ 
            extractedText: "",
            fileName,
            isEmpty: true,
            parseError: true
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unsupported file type. Please upload a PDF or TXT file." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing file:", error);
    return new Response(
      JSON.stringify({ 
        extractedText: "",
        isEmpty: true,
        parseError: true
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
