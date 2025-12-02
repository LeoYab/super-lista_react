import re

# Read the file
with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and remove the scanner modal from inside fixed-bottom-controls
# Pattern to match the scanner modal section
scanner_pattern = r'(\s+{/\* Scanner Modal \*/}\s+{showScanner && \(\s+<div className="scanner-modal-overlay">\s+<div className="scanner-modal-content">\s+<h3>Escanear Código de Barras</h3>\s+<div id="reader"></div>\s+<div className="scanner-actions" style=\{\{ marginTop: \'20px\' \}\}>\s+<Button onClick=\{handleCloseScanner\} variant="secondary">\s+Cerrar Escáner\s+</Button>\s+</div>\s+</div>\s+</div>\s+\)\}\s+)'

# Find the scanner modal
match = re.search(scanner_pattern, content, re.MULTILINE)
if match:
    scanner_modal = match.group(1)
    # Remove it from its current location
    content = content.replace(scanner_modal, '')
    
    # Find where to insert it - after the closing of fixed-bottom-controls but before closing container
    # Look for the pattern: "          </div>\n        )}\n      </div>"
    # We want to insert before the last "      </div>" which closes the container
    
    insertion_pattern = r'(\s+</div>\s+\)\}\s+)(</div>\s+</div>\s+\);\s+\})'
    
    # Create the new scanner modal with proper indentation
    new_scanner_modal = '''
        {/* Scanner Modal - Rendered outside fixed-bottom-controls for proper centering */}
        {showScanner && (
          <div className="scanner-modal-overlay">
            <div className="scanner-modal-content">
              <h3>Escanear Código de Barras</h3>
              <div id="reader"></div>
              <div className="scanner-actions" style={{ marginTop: '20px' }}>
                <Button onClick={handleCloseScanner} variant="secondary">
                  Cerrar Escáner
                </Button>
              </div>
            </div>
          </div>
        )}
'''
    
    # Insert the scanner modal in the new location
    content = re.sub(insertion_pattern, r'\1' + new_scanner_modal + '\n      \\2', content)
    
    # Write the modified content back
    with open('src/App.js', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Successfully moved scanner modal outside fixed-bottom-controls")
else:
    print("Could not find scanner modal pattern")
