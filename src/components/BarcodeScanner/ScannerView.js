import React from 'react';
import './ScannerView.css';

// Full-screen camera view: the live video (rendered by html5-qrcode into
// #reader) fills the screen, everything outside the scan frame is blurred.
const ScannerView = ({ children }) => (
  <div className="scan-fs">
    <div id="reader" className="scan-fs__reader"></div>
    <div className="scan-fs__mask"></div>
    <div className="scan-fs__frame">
      <span className="scan-fs__corner scan-fs__corner--tl"></span>
      <span className="scan-fs__corner scan-fs__corner--tr"></span>
      <span className="scan-fs__corner scan-fs__corner--bl"></span>
      <span className="scan-fs__corner scan-fs__corner--br"></span>
    </div>
    <p className="scan-fs__hint">Colocá el código de barras dentro del recuadro</p>
    <div className="scan-fs__actions">{children}</div>
  </div>
);

export default ScannerView;
