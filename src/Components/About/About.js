import React from 'react';
import './About.css';
import { Row, Col, Container } from 'react-bootstrap';
import ezra from "../../assets/ezra.jpg";


function About() {
  return (
    <div>
      <Container className="element px-0">
        <Row className="OurValuesRow">
          <Col lg={{ span: 6, order: 1 }} style={{ order: 2 }} className="OurValuesColumn">
            <div className="d-flex flex-column justify-content-between h-100">
              <div>
                <div className="OurValues">About&nbsp;Me</div>
                <div className="OurValuesText">
                  Hello, I'm Ezra Song, a student at Northview Heights Secondary School and in the H.M.S.T program. I am a passionate coder and lifelong learner. I have been immersed in the world of coding since 2020, and I continue to explore and develop my skills every day.

                  My journey into coding began with a deep curiosity and a desire to create something meaningful. As I dived into the vast realm of programming, I discovered the endless possibilities it offers for problem-solving, innovation, and creativity.

                  Throughout my coding endeavors, I have delved into various programming languages and technologies, allowing me to tackle diverse projects and expand my knowledge. I am particularly enthusiastic about web development and software engineering, where I find the perfect blend of logic, aesthetics, and user experience.               </div>
              </div>
            </div>
          </Col>
          <Col lg={{ span: 6, order: 1 }} className="ImageCol"><img src={ezra} alt="JP Abadir" className="WhiteboardImage" /></Col>
        </Row>
      </Container>
    </div>
  );
}

export default About;
