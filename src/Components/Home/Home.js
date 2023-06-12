import React from 'react';
import './Home.css';

function Home() {
  return (
    <div className="HomeMain" style={{ width: `${Math.min(document.documentElement.clientWidth*0.98, 1500)}px` }}>
    </div>
  );
}

export default Home;
