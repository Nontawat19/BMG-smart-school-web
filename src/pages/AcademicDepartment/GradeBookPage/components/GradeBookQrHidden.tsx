import React from 'react';
import QRCode from 'react-qr-code';

interface GradeBookQrHiddenProps {
    qrRef: React.RefObject<HTMLDivElement | null>;
    liveQrUrl: string | undefined;
    schoolInfo: any;
}

const GradeBookQrHidden: React.FC<GradeBookQrHiddenProps> = ({
    qrRef,
    liveQrUrl,
    schoolInfo,
}) => {
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -1000, opacity: 0, pointerEvents: 'none' }}>
            <div ref={qrRef} style={{ padding: '10px', background: 'white', display: 'inline-block' }}>
                {liveQrUrl && (
                    <>
                        <QRCode
                            value={liveQrUrl}
                            size={128}
                            level="H"
                        />
                        {schoolInfo?.logoUrl && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'white',
                                padding: '3px',
                                borderRadius: '15%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 20
                            }}>
                                <img
                                    src={schoolInfo.logoUrl}
                                    style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                                    crossOrigin="anonymous"
                                    alt="logo"
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default GradeBookQrHidden;
