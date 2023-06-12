import "./Main.css";
import { Element, scroller } from "react-scroll";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import About from "../About/About";
import Home from "../Home/Home";
import Contact from "../Contact/Contact";
import MyWork from "../MyWork/MyWork";
import "../../hamburgers.css";
import { Row, Col, Container } from 'react-bootstrap';
import homeBackground from "../../assets/HMST-banner.jpg";
import values from "../../assets/values.jpg";

const bodyScrollLock = require("body-scroll-lock");
const disableBodyScroll = bodyScrollLock.disableBodyScroll;
const enableBodyScroll = bodyScrollLock.enableBodyScroll;

const Main = forwardRef((props, ref) => {
    const refContainer = useRef(null);
    const [isToggleOpen, setIsToggleOpen] = useState(false);

    useImperativeHandle(ref, () => ({
        scrollTo(scrollPath) {
            scroller.scrollTo(scrollPath, {
                duration: 300,
                offset: -80,
            });
        },
    }));

    useEffect(() => {
        if (isToggleOpen) disableBodyScroll(refContainer.current);
        else enableBodyScroll(refContainer.current);
    }, [isToggleOpen]);

    useEffect(() => {
        scroller.scrollTo(props.scrollGoal, {
            duration: 300,
            offset: -80,
        });
    }, [props.scrollGoal]);

    function closeToggle() {
        if (isToggleOpen) refContainer.current.click();
    }

    return (
        <div>
            <div>
                <div
                    onClick={closeToggle}
                    style={{ position: "relative", width: "100%" }}
                >
                    <img
                        src={homeBackground}
                        className="BackgroundVideo Overlay"
                    />
                    <div
                        style={{
                            width: "100%",
                            justifyContent: "center",
                            display: "flex",
                        }}
                    >
                        <Element
                            name="home"
                            className="element"
                            style={{
                                minHeight: "100vh",
                                display: "flex",
                                justifyContent: "center",
                                width: "100%",
                            }}
                        >
                            <div style={{ paddingTop: "80px" }}>
                                <Home />
                            </div>
                        </Element>
                    </div>
                    <div
                        style={{ width: "100%", justifyContent: "center", display: "flex" }}
                    >
                        <Element name="about" className="element" style={{ width: "100%" }}>
                            <About />
                        </Element>
                    </div>
                    <div>
                        <Container className="element px-0">
                            <Row className="OurValuesRow">
                                <Col lg={{ span: 6, order: 1 }} style={{ order: 2 }} className="OurValuesColumn">
                                    <div className="d-flex flex-column justify-content-between h-100">
                                        <div>
                                            <div className="OurValues">My&nbsp;Values</div>
                                            <div className="OurValuesText">
                                                Integrity, honesty, and hard work are the core values that define who I am. With unwavering integrity, I uphold strong moral principles and strive to be transparent and fair in all my actions. Honesty is the foundation of my relationships, as I believe in being truthful and sincere, fostering trust and open communication. I embrace the power of hard work, dedicating myself to achieving my goals and continually learning and growing. These values guide my decisions and interactions, shaping my character and enabling me to make a positive impact on the world around me.                                            </div>
                                        </div>
                                    </div>
                                </Col>
                                <Col lg={{ span: 6, order: 1 }} className="ImageCol"><img src={values} alt="JP Abadir" className="WhiteboardImage" /></Col>
                            </Row>
                        </Container>
                    </div>
                    <div
                        style={{ width: "100%", justifyContent: "center", display: "flex" }}
                    >
                        <Element
                            name="mywork"
                            style={{ width: "100%", background: "rgb(48, 46, 58, 0.04)" }}
                            className="d-flex justify-content-center"
                        >
                            <div className="element d-flex justify-content-center">
                                <MyWork />
                            </div>
                        </Element>
                    </div>
                    <div
                        style={{
                            width: "100%",
                            backgroundColor: "#151419",
                            color: "#ededed",
                        }}
                    >
                        <div
                            className="WhiteGhost Ghost"
                            style={{ height: `${window.innerWidth / 8 - 10}px` }}
                        />
                        <div
                            className="Spacer"
                            style={{ height: `${window.innerWidth / 8}px` }}
                        />
                        <div
                            className="Ghost"
                            style={{ height: `${window.innerWidth / 8 - 10}px` }}
                        />
                        <div
                            style={{
                                width: "100%",
                                justifyContent: "center",
                                display: "flex",
                            }}
                        >
                        </div>
                        <div id="bottomPart">
                            <div
                                style={{
                                    width: "100%",
                                    justifyContent: "center",
                                    display: "flex",
                                }}
                            >
                                <Element
                                    name="contact"
                                    className="element mt-4"
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        width: "100%",
                                    }}
                                >
                                    <Contact />
                                </Element>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
});

export default Main;
