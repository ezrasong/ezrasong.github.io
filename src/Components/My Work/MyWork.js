import React from 'react';
import './MyWork.css';
import { Card } from 'antd';
import { Row, Col, Container } from 'react-bootstrap';

function WorkCard(props) {
  return (
    <Col className="PastWorkCol" md={4}>
      <div style={{ maxWidth: '250px', width: '100%' }}>
        <a href={`https://${props.link}`} target="_blank" rel="noreferrer">
          <Card className={`WorkCard ${props.title.replace(/\s/g, '')}`} />
          <div className="CardTitle">{props.title}</div>
        </a>
        <div dangerouslySetInnerHTML={{ __html: props.subtitle }} />
      </div>
    </Col>
  );
}

function OurClients() {
  return (
    <div className="pt-4">
      <Container fluid>
        <Row className="justify-content-center">
          <div className="Subtitle">My Work</div>
          <WorkCard
            link="chick-fil-a.ca"
            title="Chick-fil-A Toronto Eaton Centre"
            subtitle="We are currently helping Chick-fil-A Toronto Eaton Centre build a high-quality custom internal portal for their employees.">
          </WorkCard>
          <WorkCard
            link="technucom.com"
            title="TechNuCom"
            subtitle="We help TechNuCom manage, maintain and secure their backend infrastructure.">
          </WorkCard>
          <WorkCard
            link="proximy.ca"
            title="Proximy"
            subtitle="We assisted Proximy in developing their cross-platform mobile application in Flutter, Cloud Firestore, and Google Cloud Functions."
          />
          <WorkCard
            link="midstride.com"
            title="Midstride Technologies"
            subtitle="We collaborate closely with Midstride's team by engaging directly with their clients to gain a comprehensive understanding of their requirements, prior to constructing full-stack features in their products."
          />
          <WorkCard
            link="minebright.com"
            title="Minebright"
            subtitle="We provide Minebright with adaptable and premium quality assurance services on an as-needed basis to complement their software development endeavors.">
          </WorkCard>
          <WorkCard
            link="digitalrise.be"
            title="Digital Rise"
            subtitle="We helped Digital Rise build an interactive high-fidelity prototype for their software project.">
          </WorkCard>
        </Row>
      </Container>
    </div>
  );
}

export default OurClients;
