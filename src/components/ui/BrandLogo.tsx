import React, { useState } from 'react';

/**
 * Brand logo: the real Bayani mark (`public/bayani-logo.png`, copied from the
 * Bayani Alert Response Center) with the local SVG shield as a fallback.
 * No external/network sources.
 */
export const BrandLogo = ({ className }: { className?: string }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <img src="/logo.svg" alt="SINAG" className={`${className ?? ''} object-contain`} />;
  }

  return (
    <img
      src="/bayani-logo.png"
      alt="SINAG"
      className={`${className ?? ''} object-contain`}
      onError={() => setFailed(true)}
    />
  );
};