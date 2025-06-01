import React from 'react';
import { Popover, Text, Image, Table, Stack, Grid } from '@mantine/core';
import cpuModelPlaceholder from '../assets/images/cpu_model_performance.png';
import memoryModelPlaceholder from '../assets/images/memory_model_performance.png';

/**
 * Model Information Popover Component
 * Shows model metrics and performance charts on hover
 */
const ModelInfoPopover = () => {
  const cpuRMSE = 0.004592;
  const cpuMAE = 0.002362;
  const cpuR2 = 0.998109;
  const memoryRMSE = 0.00102;
  const memoryMAE = 0.000649;
  const memoryR2 = 0.999635;

  const ModelPopoverContent = () => (
    <Stack p="md" w={550} spacing="md">
      <Text fw={600} size="lg">Model Prediction Information</Text>
      
      <Text fw={600} size="sm">CPU Prediction Metrics</Text>
      <Grid>
        <Grid.Col span={6}>
          <Table withTableBorder withColumnBorders>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>RMSE</Table.Td>
                <Table.Td>{cpuRMSE}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>MAE</Table.Td>
                <Table.Td>{cpuMAE}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>R2</Table.Td>
                <Table.Td>{cpuR2}</Table.Td>              
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Model</Table.Td>
                <Table.Td>XGboost</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Grid.Col>
        <Grid.Col span={6}>
          <Image
            src={cpuModelPlaceholder}
            alt="CPU Model Performance"
            fallbackSrc="https://via.placeholder.com/400x200?text=CPU+Model+Performance"
          />
        </Grid.Col>
      </Grid>
      
      <Text fw={600} size="sm">Memory Prediction Metrics</Text>
      <Grid>
        <Grid.Col span={6}>
          <Table withTableBorder withColumnBorders>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>RMSE</Table.Td>
                <Table.Td>{memoryRMSE}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>MAE</Table.Td>
                <Table.Td>{memoryMAE}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>R2</Table.Td>
                <Table.Td>{memoryR2}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Model</Table.Td>
                <Table.Td>XGboost</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Grid.Col>
        <Grid.Col span={6}>
          <Image
            src={memoryModelPlaceholder}
            alt="Memory Model Performance"
            fallbackSrc="https://via.placeholder.com/400x200?text=Memory+Model+Performance"
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );

  return (
    <Popover 
      width={580} 
      position="right"
      shadow="md"
      withArrow
      arrowPosition="center"
      openDelay={300}
      closeDelay={200}
    >
      <Popover.Target>
        <div className="info-button" title="Model Information">
          <span>ℹ️</span>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <ModelPopoverContent />
      </Popover.Dropdown>
      
      <style jsx>{`
        .info-button {
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          padding: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
          margin-bottom: 10px;
        }
      `}</style>
    </Popover>
  );
};

export default ModelInfoPopover; 