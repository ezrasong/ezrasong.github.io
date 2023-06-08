import "./App.css";
import "./hamburgers.css";
import { useRef, useState } from "react";
import { BrowserRouter as Router, Outlet, Route, Routes } from "react-router-dom";
import LocalNavbar from "./Components/LocalNavbar/LocalNavbar";
import Main from "./Components/Main/Main";
import Footer from "./Components/Footer/Footer";


function App() {
  const [scrollGoal, setScrollGoal] = useState("");
  const mainRef = useRef();

  function updateScrollPath(path) {
    setScrollGoal(path);
  }


  return (
    <div>
      <Router>
        <LocalNavbar scrollHandler={updateScrollPath} />
        <Routes>
          <Route path="/" element={<Main ref={mainRef} scrollGoal={scrollGoal} />} />
        </Routes>
        <div
          style={{
            width: "100%",
            justifyContent: "center",
            display: "flex",
            backgroundColor: "black",
          }}
        >
          <div
            className="element"
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              alignItems: "center",
            }}
          >
            <Footer />
          </div>
        </div>
      </Router >
    </div >
  );
}

export default App;
