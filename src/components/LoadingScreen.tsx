export function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060606",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          color: "#00FF88",
          letterSpacing: -1,
        }}
      >
        GRIDD
      </div>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid #00FF88",
          borderTop: "3px solid transparent",
          animation: "gridd-spin 0.8s linear infinite",
        }}
      />
      <style>{`
        @keyframes gridd-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
